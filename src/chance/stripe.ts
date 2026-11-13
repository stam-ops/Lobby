import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Appels à Stripe sans SDK (fetch, application/x-www-form-urlencoded) et signature des webhooks, communs au Campok VIP
 * (vip-web.service.ts) et à l'offre Analyse (analyse-web.service.ts) vendus sur le Chance-o-mètre.
 */
const STRIPE_VERSION = '2024-06-20';     // forme des objets lus (les deux formes d'invoice sont lues)
const SIG_TOLERANCE_S = 300;
export const PAY_OFF = 'Paiement indisponible pour le moment : réessaie un peu plus tard.';

type Obj = Record<string, any>;

/** Échec d'un appel à Stripe (stripeStatus : code HTTP de Stripe, 0 si Stripe n'a pas répondu) : 503 pour le visiteur. */
export class StripeError extends ServiceUnavailableException {
  constructor(readonly stripeStatus: number) { super(PAY_OFF); }
}

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

/** Appel à l'API Stripe ; StripeError si Stripe ne répond pas ou refuse (détail dans les journaux seulement). */
export async function stripeRequest(key: string, method: 'GET' | 'POST' | 'DELETE', path: string, params: Obj | undefined, logger: Logger): Promise<Obj> {
  let res: Response;
  try {
    res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': STRIPE_VERSION },
      body: params ? stripeForm(params).join('&') : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    logger.error(`Stripe ${method} ${path} : ${(e as Error).message}`);
    throw new StripeError(0);
  }
  const j: Obj = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error(`Stripe ${method} ${path} : ${res.status} ${j?.error?.message ?? ''}`);
    throw new StripeError(res.status);
  }
  return j;
}
