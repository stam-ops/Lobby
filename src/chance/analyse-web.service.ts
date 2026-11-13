import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { chanceTable } from './chance-db';
import { checkoutBranding, createCheckout, PAY_OFF, StripeError, stripeRequest } from './stripe';

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

  /** Backoffice : fin de l'offre Analyse en cours (ISO), pour les comptes d'une page de la liste. */
  async untilOf(uids: number[]): Promise<Map<number, string>> {
    const m = new Map<number, string>();
    if (!uids.length || !(await this.ready())) return m;
    const rows = await this.ds.query<{ id: number; until: Date }[]>(
      `SELECT chanceuserid AS id, untilts AS until FROM ${this.offers}
        WHERE untilts > NOW() AND chanceuserid IN (${uids.map(() => '?').join(', ')})`, uids,
    );
    for (const r of rows) m.set(Number(r.id), new Date(r.until).toISOString());
    return m;
  }

  /** Backoffice : comptes dont l'offre Analyse est en cours (filtre de la liste). */
  async activeIds(): Promise<number[]> {
    if (!(await this.ready())) return [];
    const rows = await this.ds.query<{ id: number }[]>(`SELECT chanceuserid AS id FROM ${this.offers} WHERE untilts > NOW()`);
    return rows.map((r) => Number(r.id));
  }

  /** Backoffice : paiements et abonnements de l'offre Analyse d'un compte, du plus récent au plus ancien. */
  async adminPurchases(uid: number) {
    if (!(await this.ready())) return { payments: [], subs: [] };
    const pays = await this.ds.query<{ plan: string; cents: number; orderid: string; subkey: string; ts: Date }[]>(
      `SELECT plan, cents, orderid, subkey, creationts AS ts FROM ${this.payments} WHERE chanceuserid = ? ORDER BY creationts DESC`, [uid],
    );
    const subs = await this.ds.query<{ subkey: string; status: string; created: Date; updated: Date }[]>(
      `SELECT subkey, status, creationts AS created, updatedts AS updated FROM ${this.subs} WHERE chanceuserid = ? ORDER BY updatedts DESC`, [uid],
    );
    const name = (p: string) => ANALYSE_PLANS[p as AnalysePlan]?.name ?? `Offre Analyse (${p})`;
    return {
      payments: pays.map((p) => ({ ts: new Date(p.ts).toISOString(), product: 'analyse', plan: p.plan, label: name(p.plan),
        platform: 'stripe', cents: Number(p.cents), currency: 'EUR', orderId: p.orderid, subKey: p.subkey || null, validated: true })),
      subs: subs.map((s) => ({ product: 'analyse', platform: 'stripe', productId: 'analyse_mois', label: name('mois'), subKey: s.subkey,
        status: s.status, createdTs: new Date(s.created).toISOString(), updatedTs: new Date(s.updated).toISOString(), expiryTs: null })),
    };
  }

  /**
   * Backoffice : résumé des ventes de l'offre Analyse (le VIP vendu sur le web est déjà dans les paiements Campok,
   * plateforme stripe) : totaux par formule, offres et abonnements en cours, ventes des 12 derniers mois, et liste des
   * paiements du plus récent au plus ancien (adresse du compte, ou null s'il a été supprimé), recherche par e-mail.
   */
  async adminSales(search = '', page = 0, pageSize = 50) {
    const size = Math.min(200, Math.max(1, pageSize | 0)), from = Math.max(0, page | 0) * size;
    const empty = { open: false, totals: { payments: 0, cents: 0, buyers: 0, byPlan: [], offersActive: 0, subs: { active: 0, canceled: 0, expired: 0 } },
      months: [], items: [], total: 0 };
    if (!(await this.ready())) return empty;
    const name = (p: string) => ANALYSE_PLANS[p as AnalysePlan]?.name ?? `Offre Analyse (${p})`;
    const byPlan = await this.ds.query<{ plan: string; n: number | string; cents: number | string; buyers: number | string }[]>(
      `SELECT plan, COUNT(*) AS n, SUM(cents) AS cents, COUNT(DISTINCT chanceuserid) AS buyers FROM ${this.payments}
        WHERE product = ? GROUP BY plan ORDER BY plan`, [ANALYSE_PRODUCT],
    );
    const [all] = await this.ds.query<{ n: number | string; cents: number | string | null; buyers: number | string }[]>(
      `SELECT COUNT(*) AS n, SUM(cents) AS cents, COUNT(DISTINCT chanceuserid) AS buyers FROM ${this.payments} WHERE product = ?`, [ANALYSE_PRODUCT],
    );
    const [act] = await this.ds.query<{ n: number | string }[]>(`SELECT COUNT(*) AS n FROM ${this.offers} WHERE untilts > NOW()`);
    const subs = await this.ds.query<{ status: string; n: number | string }[]>(
      `SELECT status, COUNT(*) AS n FROM ${this.subs} WHERE product = ? GROUP BY status`, [ANALYSE_PRODUCT],
    );
    const months = await this.ds.query<{ month: string; plan: string; n: number | string; cents: number | string }[]>(
      `SELECT DATE_FORMAT(creationts, '%Y-%m') AS month, plan, COUNT(*) AS n, SUM(cents) AS cents FROM ${this.payments}
        WHERE product = ? AND creationts >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 11 MONTH)
        GROUP BY month, plan ORDER BY month DESC`, [ANALYSE_PRODUCT],
    );
    const q = search.trim();
    const where = `p.product = ?${q ? ' AND u.email LIKE ?' : ''}`;
    const args: unknown[] = [ANALYSE_PRODUCT, ...(q ? [`%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`] : [])];
    const [cnt] = await this.ds.query<{ n: number | string }[]>(
      `SELECT COUNT(*) AS n FROM ${this.payments} p LEFT JOIN ${this.users} u ON u.chanceuserid = p.chanceuserid WHERE ${where}`, args,
    );
    const rows = await this.ds.query<{ id: number; uid: number; email: string | null; plan: string; cents: number; orderid: string; subkey: string; ts: Date }[]>(
      `SELECT p.chancepaymentid AS id, p.chanceuserid AS uid, u.email, p.plan, p.cents, p.orderid, p.subkey, p.creationts AS ts
        FROM ${this.payments} p LEFT JOIN ${this.users} u ON u.chanceuserid = p.chanceuserid
        WHERE ${where} ORDER BY p.creationts DESC, p.chancepaymentid DESC LIMIT ? OFFSET ?`, [...args, size, from],
    );
    const mon = new Map<string, { month: string; n: number; cents: number; byPlan: Record<string, number> }>();
    for (const m of months) {
      const x = mon.get(m.month) ?? { month: m.month, n: 0, cents: 0, byPlan: {} };
      x.n += Number(m.n); x.cents += Number(m.cents); x.byPlan[m.plan] = (x.byPlan[m.plan] ?? 0) + Number(m.n);
      mon.set(m.month, x);
    }
    const st = (s: string) => Number(subs.find((x) => x.status === s)?.n ?? 0);
    return {
      open: await this.enabled(),
      totals: {
        payments: Number(all?.n ?? 0), cents: Number(all?.cents ?? 0), buyers: Number(all?.buyers ?? 0),
        byPlan: byPlan.map((p) => ({ plan: p.plan, label: name(p.plan), n: Number(p.n), cents: Number(p.cents), buyers: Number(p.buyers) })),
        offersActive: Number(act?.n ?? 0), subs: { active: st('active'), canceled: st('canceled'), expired: st('expired') },
      },
      months: [...mon.values()],
      items: rows.map((r) => ({ id: Number(r.id), userId: Number(r.uid), email: r.email ?? null, plan: r.plan, label: name(r.plan),
        cents: Number(r.cents), orderId: r.orderid, subKey: r.subkey || null, ts: new Date(r.ts).toISOString() })),
      total: Number(cnt?.n ?? 0),
    };
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
    // Logo Campok et nom « Chance-o-mètre » en haut de la page de paiement.
    const s = await createCheckout(this.key, {
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
    }, checkoutBranding(this.publicUrl, 'Chance-o-mètre'), this.logger);
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
   * Renvoie le nombre d'abonnements arrêtés (e-mail de confirmation de la suppression).
   */
  async forget(uid: number): Promise<number> {
    if (!(await this.ready())) return 0;
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
    return rows.length;
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
