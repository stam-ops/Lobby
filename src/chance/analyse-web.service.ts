import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { chanceTable } from './chance-db';
import { PAY_OFF, StripeError, stripeRequest } from './stripe';

/**
 * Offre Analyse du Chance-o-mètre (sql/004_chance_analyse.sql) : mains des salles ANJ analysées et ouvertes sans
 * limite. Rattachée au compte du Chance-o-mètre (chanceuserid), pas au joueur Campok. Payée par Stripe Checkout, comme
 * le Campok VIP (vip-web.service.ts, qui reçoit le webhook et passe ici les événements de l'offre) :
 *  - pack de 12 mois : paiement unique, crédité à `checkout.session.completed` (ou `async_payment_succeeded`) ;
 *  - abonnement mensuel : chaque facture payée (`invoice.paid`) prolonge jusqu'à la fin de la période payée (plus un
 *    jour de marge pour le renouvellement) ; résiliable à tout moment (fin de la période en cours, l'offre payée reste).
 * Fin de l'offre : chanceanalyse.untilts, prolongée à chaque paiement, jamais raccourcie.
 * Paiements : chancepayment (orderid UNIQUE : un événement rejoué ne crédite pas deux fois), gardés après la suppression
 * du compte. Abonnements : chancesub. Suppression du compte : abonnement arrêté tout de suite chez Stripe (forget).
 * Événements reconnus par metadata.product = 'analyse' (ou l'abonnement déjà connu dans chancesub).
 */
export const ANALYSE_PRODUCT = 'analyse';
export const ANALYSE_PLANS = {
  mois: { months: 1,  cents: 690,  sub: true,  name: 'Chance-o-mètre · offre Analyse · abonnement mensuel' },
  an:   { months: 12, cents: 6500, sub: false, name: 'Chance-o-mètre · offre Analyse · 12 mois' },
} as const;
export type AnalysePlan = keyof typeof ANALYSE_PLANS;
export const ANALYSE_PLAN_KEYS = Object.keys(ANALYSE_PLANS) as AnalysePlan[];
const RENEW_GRACE_DAYS = 1;              // abonnement : marge après la fin de la période, le temps du renouvellement
const TABLES_RECHECK_MS = 60_000;        // sql/004 pas encore passé : revérifié au plus une fois par minute

type Obj = Record<string, any>;
export interface AnalyseStatus { analyse: boolean; analyseUntil: string | null; analyseSub: 'active' | 'canceled' | null }
const NONE: AnalyseStatus = { analyse: false, analyseUntil: null, analyseSub: null };

@Injectable()
export class AnalyseWebService {
  private readonly logger = new Logger('AnalyseWeb');
  private readonly key: string;
  private readonly whSecret: string;
  private readonly publicUrl: string;
  private readonly users: string;
  private readonly offers: string;
  private readonly payments: string;
  private readonly subs: string;
  private tablesOk = false;
  private tablesAt = 0;

  constructor(private readonly ds: DataSource, config: ConfigService) {
    this.key = config.get<string>('STRIPE_SECRET_KEY', '');
    this.whSecret = config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    this.publicUrl = config.get<string>('CHANCE_PUBLIC_URL', 'http://localhost:5174').replace(/\/+$/, '');
    this.users = chanceTable(config, 'chanceuser');
    this.offers = chanceTable(config, 'chanceanalyse');
    this.payments = chanceTable(config, 'chancepayment');
    this.subs = chanceTable(config, 'chancesub');
  }

  /** Tables de sql/004 présentes ? (résultat positif gardé, négatif revérifié chaque minute) */
  private async ready(): Promise<boolean> {
    if (this.tablesOk || Date.now() - this.tablesAt < TABLES_RECHECK_MS) return this.tablesOk;
    this.tablesAt = Date.now();
    try {
      for (const t of [this.offers, this.payments, this.subs]) await this.ds.query(`SELECT 1 FROM ${t} LIMIT 0`);
      this.tablesOk = true;
    } catch {
      this.logger.warn('Offre Analyse fermée : sql/004_chance_analyse.sql pas encore passé.');
    }
    return this.tablesOk;
  }

  /** Vente ouverte : clés Stripe présentes et tables créées. */
  async enabled(): Promise<boolean> { return !!this.key && !!this.whSecret && (await this.ready()); }

  /** Offre en cours, sa fin et l'abonnement (encore actif ou résilié), pour le profil. */
  async status(uid: number): Promise<AnalyseStatus> {
    if (!(await this.ready())) return NONE;
    const [r] = await this.ds.query<{ until: Date; on: number | string }[]>(
      `SELECT untilts AS until, (untilts > NOW()) AS \`on\` FROM ${this.offers} WHERE chanceuserid = ?`, [uid],
    );
    if (!r || Number(r.on) !== 1) return NONE;
    const [s] = await this.ds.query<{ status: string }[]>(
      `SELECT status FROM ${this.subs} WHERE chanceuserid = ? AND product = ? AND status IN ('active', 'canceled')
        ORDER BY updatedts DESC LIMIT 1`, [uid, ANALYSE_PRODUCT],
    );
    return { analyse: true, analyseUntil: new Date(r.until).toISOString(), analyseSub: (s?.status as 'active' | 'canceled') ?? null };
  }

  /** Page de paiement Stripe pour ce compte (offre pas déjà en cours) → { url }. */
  async checkout(user: { chanceuserid: number; email: string }, plan: AnalysePlan) {
    const p = ANALYSE_PLANS[plan];
    if (!p) throw new BadRequestException('Formule inconnue.');
    if (!(await this.enabled())) throw new ServiceUnavailableException(PAY_OFF);
    const uid = Number(user.chanceuserid);
    if ((await this.status(uid)).analyse) throw new ConflictException('Tu as déjà l’offre Analyse.');
    const meta = { product: ANALYSE_PRODUCT, chanceuserid: String(uid), plan };
    const back = `${this.publicUrl}/chance-o-metre`;
    const s = await stripeRequest(this.key, 'POST', '/checkout/sessions', {
      mode: p.sub ? 'subscription' : 'payment',
      locale: 'fr',
      customer_email: user.email,
      client_reference_id: `chance-${uid}`,
      line_items: [{
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: p.cents, product_data: { name: p.name }, ...(p.sub ? { recurring: { interval: 'month' } } : {}) },
      }],
      metadata: meta,
      ...(p.sub ? { subscription_data: { metadata: meta } } : { invoice_creation: { enabled: true }, payment_intent_data: { metadata: meta } }),
      success_url: `${back}?analyse=merci#compte`,
      cancel_url: `${back}?analyse=annule#compte`,
    }, this.logger);
    if (typeof s.url !== 'string') throw new ServiceUnavailableException(PAY_OFF);
    return { url: s.url as string };
  }

  /** Résiliation de l'abonnement : plus de renouvellement, l'offre payée reste jusqu'à la fin de la période. */
  async cancel(uid: number) {
    if (!(await this.ready())) throw new NotFoundException('Aucun abonnement à résilier.');
    const [row] = await this.ds.query<{ subkey: string }[]>(
      `SELECT subkey FROM ${this.subs} WHERE chanceuserid = ? AND product = ? AND status = 'active'
        ORDER BY updatedts DESC LIMIT 1`, [uid, ANALYSE_PRODUCT],
    );
    if (!row) throw new NotFoundException('Aucun abonnement à résilier.');
    if (!this.key) throw new ServiceUnavailableException(PAY_OFF);
    await stripeRequest(this.key, 'POST', `/subscriptions/${encodeURIComponent(row.subkey)}`, { cancel_at_period_end: 'true' }, this.logger);
    await this.ds.query(`UPDATE ${this.subs} SET status = 'canceled' WHERE subkey = ?`, [row.subkey]);
    this.logger.log(`Abonnement Analyse résilié compte=${uid}`);
  }

  /**
   * Suppression du compte : abonnement en cours arrêté tout de suite chez Stripe (plus aucun prélèvement), offre
   * effacée ; les paiements restent (comptabilité). Échec chez Stripe : erreur, le compte n'est pas supprimé (à refaire).
   */
  async forget(uid: number) {
    if (!(await this.ready())) return;
    const rows = await this.ds.query<{ subkey: string }[]>(
      `SELECT subkey FROM ${this.subs} WHERE chanceuserid = ? AND status = 'active'`, [uid],
    );
    for (const r of rows) {
      if (!this.key) throw new ServiceUnavailableException('Suppression impossible pour le moment : réessaie un peu plus tard.');
      try {
        await stripeRequest(this.key, 'DELETE', `/subscriptions/${encodeURIComponent(r.subkey)}`, undefined, this.logger);
      } catch (e) {
        if (!(e instanceof StripeError && e.stripeStatus === 404)) {
          throw new ServiceUnavailableException('Suppression impossible pour le moment : réessaie un peu plus tard.');
        }
      }
      this.logger.log(`Abonnement Analyse arrêté à la suppression du compte=${uid}`);
    }
    await this.ds.query(`UPDATE ${this.subs} SET status = 'expired' WHERE chanceuserid = ?`, [uid]);
    await this.ds.query(`DELETE FROM ${this.offers} WHERE chanceuserid = ?`, [uid]);
  }

  // ─── Webhook (reçu par vip-web.service.ts) ────────────────────────────────────────────────────

  /** Événement de l'offre Analyse ? (metadata.product, sinon abonnement déjà connu) */
  async owns(ev: Obj): Promise<boolean> {
    const o: Obj = ev?.data?.object ?? {};
    switch (ev?.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return o.metadata?.product === ANALYSE_PRODUCT;
      case 'invoice.paid': {
        const meta = o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {};
        return meta.product === ANALYSE_PRODUCT || (await this.knownSub(subIdOf(o)));
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return o.metadata?.product === ANALYSE_PRODUCT || (await this.knownSub(o.id));
    }
    return false;
  }

  private async knownSub(subId: string | null): Promise<boolean> {
    if (!subId || !(await this.ready())) return false;
    const [r] = await this.ds.query<{ n: number }[]>(`SELECT 1 AS n FROM ${this.subs} WHERE subkey = ? LIMIT 1`, [subId]);
    return !!r;
  }

  /** Événement de l'offre : tables absentes → 503, Stripe le renverra plus tard. */
  async handle(ev: Obj) {
    if (!(await this.ready())) throw new ServiceUnavailableException(PAY_OFF);
    const o: Obj = ev?.data?.object ?? {};
    switch (ev.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const uid = Number(o.metadata?.chanceuserid), plan = o.metadata?.plan as AnalysePlan;
        if (!uid || !ANALYSE_PLANS[plan]) { this.logger.warn(`Stripe ${ev.type} Analyse sans compte ou formule (${o.id})`); break; }
        if (o.mode === 'subscription') {
          // Crédité facture par facture (invoice.paid) ; ici, seulement le lien abonnement → compte.
          if (typeof o.subscription === 'string') await this.mapSub(o.subscription, uid, 'active');
        } else if (o.payment_status === 'paid') {
          await this.grant(uid, plan, Number(o.amount_total) || ANALYSE_PLANS[plan].cents, `stripe:${o.id}`, '', null);
        }
        break;
      }
      case 'invoice.paid': {
        const subId = subIdOf(o);
        if (!subId || !(Number(o.amount_paid) > 0)) break;
        const meta = o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {};
        let uid = Number(meta.chanceuserid);
        if (!uid) {
          const [r] = await this.ds.query<{ chanceuserid: number }[]>(`SELECT chanceuserid FROM ${this.subs} WHERE subkey = ? LIMIT 1`, [subId]);
          uid = Number(r?.chanceuserid);
        }
        if (!uid) { this.logger.warn(`Stripe invoice.paid Analyse : abonnement inconnu ${subId}`); break; }
        const end = Number(o.lines?.data?.[0]?.period?.end) || 0;
        await this.mapSub(subId, uid, 'active');
        await this.grant(uid, 'mois', Number(o.amount_paid), `stripe:${o.id}`, subId, end || null);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const status = ev.type === 'customer.subscription.deleted' ? 'expired'
          : o.cancel_at_period_end ? 'canceled' : o.status === 'active' ? 'active' : String(o.status || 'active').slice(0, 20);
        await this.ds.query(`UPDATE ${this.subs} SET status = ? WHERE subkey = ?`, [status, o.id]);
        break;
      }
    }
  }

  /**
   * Une seule fois par paiement (orderid UNIQUE) : offre prolongée de n mois (pack), ou jusqu'à la fin de la période
   * payée plus un jour (abonnement, `endS` en secondes). Compte supprimé entre-temps : paiement noté, rien à prolonger.
   */
  private async grant(uid: number, plan: AnalysePlan, cents: number, orderId: string, subkey: string, endS: number | null) {
    const res: { affectedRows?: number } = await this.ds.query(
      `INSERT INTO ${this.payments} (chanceuserid, product, plan, cents, orderid, subkey)
       VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE chancepaymentid = chancepaymentid`,
      [uid, ANALYSE_PRODUCT, plan, cents, orderId, subkey],
    );
    if (!(Number(res?.affectedRows ?? 0) > 0)) return; // déjà crédité (événement rejoué)
    const [u] = await this.ds.query<{ n: number }[]>(`SELECT 1 AS n FROM ${this.users} WHERE chanceuserid = ?`, [uid]);
    if (!u) { this.logger.warn(`Paiement Analyse pour un compte supprimé (${uid}, ${orderId})`); return; }
    if (endS) {
      await this.ds.query(
        `INSERT INTO ${this.offers} (chanceuserid, untilts) VALUES (?, GREATEST(NOW(), FROM_UNIXTIME(?) + INTERVAL ? DAY))
         ON DUPLICATE KEY UPDATE untilts = GREATEST(untilts, NOW(), FROM_UNIXTIME(?) + INTERVAL ? DAY)`,
        [uid, endS, RENEW_GRACE_DAYS, endS, RENEW_GRACE_DAYS],
      );
    } else {
      const m = ANALYSE_PLANS[plan].months;
      await this.ds.query(
        `INSERT INTO ${this.offers} (chanceuserid, untilts) VALUES (?, NOW() + INTERVAL ? MONTH)
         ON DUPLICATE KEY UPDATE untilts = GREATEST(untilts, NOW()) + INTERVAL ? MONTH`,
        [uid, m, m],
      );
    }
    this.logger.log(`Offre Analyse compte=${uid} (${plan}, ${orderId})`);
  }

  private async mapSub(subId: string, uid: number, status: string) {
    await this.ds.query(
      `INSERT INTO ${this.subs} (chanceuserid, product, subkey, status) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = IF(status IN ('canceled', 'expired'), status, VALUES(status))`,
      [uid, ANALYSE_PRODUCT, subId, status],
    );
  }
}

/** Id de l'abonnement d'une facture (les deux formes d'invoice de Stripe). */
function subIdOf(o: Obj): string | null {
  const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
  const id = typeof sub === 'string' ? sub : sub?.id;
  return typeof id === 'string' && id ? id : null;
}
