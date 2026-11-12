import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Campok VIP vendu sur le Chance-o-mètre (compte Campok relié), payé par Stripe Checkout : la page de paiement est
 * celle de Stripe, aucune donnée de carte ne passe par nos serveurs. Mêmes avantages que le VIP des stores :
 * player.accounttype = 1, endvipts PROLONGÉ (GREATEST(endvipts, NOW()) + n mois, jamais écrasé), 30 Cam's par mois.
 *  - pass 1, 3 ou 6 mois : paiement unique, crédité à `checkout.session.completed` (ou `async_payment_succeeded`) ;
 *  - abonnement mensuel : chaque facture payée (`invoice.paid`) prolonge d'un mois ; résiliable à tout moment
 *    (fin de la période en cours, le VIP payé reste) depuis la page, par `cancel`.
 * Ledger : paymentpoker (platform 'stripe', orderid UNIQUE = id Stripe : un événement rejoué ne crédite pas deux fois),
 * abonnement : playersubscription (platform 'stripe', subkey = id de l'abonnement).
 * Webhook : signature Stripe (STRIPE_WEBHOOK_SECRET) vérifiée sur le corps brut (rawBody de main.ts).
 */
export const VIP_PLANS = {
  '1m':   { months: 1, cents: 599,  sub: false, name: 'Campok VIP · 1 mois' },
  '3m':   { months: 3, cents: 1599, sub: false, name: 'Campok VIP · 3 mois' },
  '6m':   { months: 6, cents: 2799, sub: false, name: 'Campok VIP · 6 mois' },
  'mois': { months: 1, cents: 599,  sub: true,  name: 'Campok VIP · abonnement mensuel' },
} as const;
export type VipPlan = keyof typeof VIP_PLANS;
export const VIP_PLAN_KEYS = Object.keys(VIP_PLANS) as VipPlan[];
const CAMS_PER_MONTH = 30;               // comme le VIP des stores (+30 Cam's/mois)
const STRIPE_VERSION = '2024-06-20';     // forme des objets lus ci-dessous (les deux formes d'invoice sont lues)
const SIG_TOLERANCE_S = 300;
const PAY_OFF = 'Paiement indisponible pour le moment : réessaie un peu plus tard.';

type Obj = Record<string, any>;

/** Paramètres Stripe (application/x-www-form-urlencoded, objets et listes en a[b][0][c]). */
export function stripeForm(params: Obj, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => out.push(...(typeof x === 'object' ? stripeForm(x, `${key}[${i}]`) : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`])));
    else if (typeof v === 'object') out.push(...stripeForm(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

/** En-tête Stripe-Signature (t=…,v1=…) : HMAC-SHA256 de « t.corps », 5 minutes de tolérance. */
export function stripeSignatureOk(raw: Buffer, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  let t = 0; const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2);
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > SIG_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
  return sigs.some(s => {
    const b = Buffer.from(s, 'hex');
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

@Injectable()
export class VipWebService {
  private readonly logger = new Logger('VipWeb');
  private readonly key: string;
  private readonly whSecret: string;
  private readonly publicUrl: string;

  constructor(private readonly ds: DataSource, config: ConfigService) {
    this.key = config.get<string>('STRIPE_SECRET_KEY', '');
    this.whSecret = config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    this.publicUrl = config.get<string>('CHANCE_PUBLIC_URL', 'http://localhost:5174').replace(/\/+$/, '');
  }

  /** Vente ouverte : clés Stripe présentes. */
  get enabled() { return !!this.key && !!this.whSecret; }

  /** VIP en cours et abonnement web (Stripe) encore actif ou résilié, pour le profil. */
  async status(playerId: number): Promise<{ vip: boolean; vipUntil: string | null; vipSub: 'active' | 'canceled' | null }> {
    const [p] = await this.ds.query<{ vip: number | string; until: Date | null }[]>(
      'SELECT (accounttype = 1 AND endvipts > NOW()) AS vip, endvipts AS until FROM player WHERE playerid = ?', [playerId],
    );
    const vip = Number(p?.vip) === 1;
    if (!vip) return { vip, vipUntil: null, vipSub: null };
    const [s] = await this.ds.query<{ status: string }[]>(
      `SELECT status FROM playersubscription WHERE platform = 'stripe' AND playerid = ? AND status IN ('active', 'canceled')
        ORDER BY updatedts DESC LIMIT 1`, [playerId],
    );
    return { vip, vipUntil: p.until ? new Date(p.until).toISOString() : null, vipSub: (s?.status as 'active' | 'canceled') ?? null };
  }

  /** Page de paiement Stripe pour ce joueur (pas déjà VIP) → { url }. */
  async checkout(user: { chanceuserid: number; email: string; playerid: number | null }, plan: VipPlan) {
    const p = VIP_PLANS[plan];
    if (!p) throw new BadRequestException('Formule inconnue.');
    if (user.playerid == null) throw new BadRequestException('Relie d’abord ton compte Campok.');
    if (!this.enabled) throw new ServiceUnavailableException(PAY_OFF);
    const pid = Number(user.playerid);
    if ((await this.status(pid)).vip) throw new ConflictException('Tu es déjà Campok VIP.');
    const meta = { playerid: String(pid), plan, chanceuserid: String(user.chanceuserid) };
    const back = `${this.publicUrl}/chance-o-metre`;
    const s = await this.stripe('POST', '/checkout/sessions', {
      mode: p.sub ? 'subscription' : 'payment',
      locale: 'fr',
      customer_email: user.email,
      client_reference_id: String(pid),
      line_items: [{
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: p.cents, product_data: { name: p.name }, ...(p.sub ? { recurring: { interval: 'month' } } : {}) },
      }],
      metadata: meta,
      ...(p.sub ? { subscription_data: { metadata: meta } } : { invoice_creation: { enabled: true }, payment_intent_data: { metadata: meta } }),
      success_url: `${back}?vip=merci#compte`,
      cancel_url: `${back}?vip=annule#compte`,
    });
    if (typeof s.url !== 'string') throw new ServiceUnavailableException(PAY_OFF);
    return { url: s.url as string };
  }

  /** Résiliation de l'abonnement web : plus de renouvellement, le VIP payé reste jusqu'à la fin de la période. */
  async cancel(playerId: number | null) {
    if (playerId == null) throw new BadRequestException('Relie d’abord ton compte Campok.');
    const [row] = await this.ds.query<{ subkey: string }[]>(
      `SELECT subkey FROM playersubscription WHERE platform = 'stripe' AND playerid = ? AND status = 'active'
        ORDER BY updatedts DESC LIMIT 1`, [playerId],
    );
    if (!row) throw new NotFoundException('Aucun abonnement à résilier.');
    if (!this.key) throw new ServiceUnavailableException(PAY_OFF);
    await this.stripe('POST', `/subscriptions/${encodeURIComponent(row.subkey)}`, { cancel_at_period_end: 'true' });
    await this.ds.query(`UPDATE playersubscription SET status = 'canceled' WHERE platform = 'stripe' AND subkey = ?`, [row.subkey]);
    this.logger.log(`Abonnement web résilié player=${playerId}`);
  }

  /** Événement Stripe (corps brut et signature) ; false si la signature est refusée. */
  async webhook(raw: Buffer | undefined, signature: string | undefined): Promise<boolean> {
    if (!this.whSecret) throw new ServiceUnavailableException(PAY_OFF);
    if (!raw || !stripeSignatureOk(raw, signature, this.whSecret)) return false;
    let ev: Obj;
    try { ev = JSON.parse(raw.toString('utf8')); } catch { return false; }
    const o: Obj = ev?.data?.object ?? {};
    switch (ev.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const pid = Number(o.metadata?.playerid), plan = o.metadata?.plan as VipPlan;
        if (!pid || !VIP_PLANS[plan]) { this.logger.warn(`Stripe ${ev.type} sans joueur ou formule (${o.id})`); break; }
        if (o.mode === 'subscription') {
          // L'abonnement est crédité facture par facture (invoice.paid) ; ici, seulement le lien abonnement → joueur.
          if (typeof o.subscription === 'string') await this.mapSub(o.subscription, pid, plan, null, 'active');
        } else if (o.payment_status === 'paid') {
          await this.grant(pid, plan, `stripe:${o.id}`, '');
        }
        break;
      }
      case 'invoice.paid': {
        const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
        const subId = typeof sub === 'string' ? sub : sub?.id;
        if (!subId || !(Number(o.amount_paid) > 0)) break;
        const meta = o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {};
        let pid = Number(meta.playerid);
        if (!pid) {
          const [r] = await this.ds.query<{ playerid: number }[]>(
            `SELECT playerid FROM playersubscription WHERE platform = 'stripe' AND subkey = ? LIMIT 1`, [subId]);
          pid = Number(r?.playerid);
        }
        if (!pid) { this.logger.warn(`Stripe invoice.paid : abonnement inconnu ${subId}`); break; }
        const end = Number(o.lines?.data?.[0]?.period?.end) || 0;
        await this.mapSub(subId, pid, 'mois', end ? end * 1000 : null, 'active');
        await this.grant(pid, 'mois', `stripe:${o.id}`, subId);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const status = ev.type === 'customer.subscription.deleted' ? 'expired'
          : o.cancel_at_period_end ? 'canceled' : o.status === 'active' ? 'active' : String(o.status || 'active').slice(0, 20);
        await this.ds.query(`UPDATE playersubscription SET status = ? WHERE platform = 'stripe' AND subkey = ?`, [status, o.id]);
        break;
      }
    }
    return true;
  }

  // ─── Crédit du VIP ────────────────────────────────────────────────────────────────────────────

  /** Une seule fois par paiement (orderid UNIQUE) : VIP prolongé de n mois et 30 Cam's par mois. */
  private async grant(pid: number, plan: VipPlan, orderId: string, subkey: string) {
    const p = VIP_PLANS[plan];
    const res: { affectedRows?: number } = await this.ds.query(
      `INSERT INTO paymentpoker (playerid, platform, productid, producttype, orderid, subkey, validated)
       VALUES (?, 'stripe', ?, 1, ?, ?, 1) ON DUPLICATE KEY UPDATE paymentpokerid = paymentpokerid`,
      [pid, `web_vip_${plan}`, orderId, subkey],
    );
    if (!(Number(res?.affectedRows ?? 0) > 0)) return; // déjà crédité (événement rejoué)
    await this.ds.query(
      `UPDATE player SET accounttype = 1, endvipts = GREATEST(COALESCE(endvipts, NOW()), NOW()) + INTERVAL ? MONTH
        WHERE playerid = ?`, [p.months, pid],
    );
    await this.ds.query('UPDATE playeraccount SET cams = cams + ? WHERE playerid = ?', [CAMS_PER_MONTH * p.months, pid]);
    this.logger.log(`VIP web player=${pid} +${p.months} mois +${CAMS_PER_MONTH * p.months} Cam's (${plan}, ${orderId})`);
  }

  private async mapSub(subId: string, pid: number, plan: VipPlan, expiryMs: number | null, status: string) {
    await this.ds.query(
      `INSERT INTO playersubscription (playerid, platform, productid, subkey, expiryts, status)
       VALUES (?, 'stripe', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE expiryts = IF(VALUES(expiryts) > 0, VALUES(expiryts), expiryts),
         status = IF(status = 'canceled', status, VALUES(status))`,
      [pid, `web_vip_${plan}`, subId, expiryMs ?? 0, status],
    );
  }

  private async stripe(method: 'GET' | 'POST', path: string, params?: Obj): Promise<Obj> {
    let res: Response;
    try {
      res = await fetch(`https://api.stripe.com/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': STRIPE_VERSION },
        body: params ? stripeForm(params).join('&') : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.error(`Stripe ${method} ${path} : ${(e as Error).message}`);
      throw new ServiceUnavailableException(PAY_OFF);
    }
    const j: Obj = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error(`Stripe ${method} ${path} : ${res.status} ${j?.error?.message ?? ''}`);
      throw new ServiceUnavailableException(PAY_OFF);
    }
    return j;
  }
}
