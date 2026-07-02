import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { SignJWT, importPKCS8, decodeJwt } from 'jose';

/**
 * Webhooks des stores pour l'état des abonnements VIP (renouvellement / annulation / remboursement),
 * hors session joueur. Mapping abonnement → joueur via la table `playersubscription` (subkey renseigné
 * à l'achat par ProcessPaymentTask). Met à jour `player.endvipts` (+ accounttype) et `playersubscription`.
 *
 * Sécurité :
 *  - Google (RTDN Pub/Sub push) : secret dans l'URL du push (WEBHOOK_GOOGLE_TOKEN). On étend le VIP par
 *    la période de l'offre (offer.vipdays) selon le notificationType (pas d'appel Play API).
 *  - Apple (ASSN V2) : on RE-RÉCUPÈRE la transaction autoritative via l'App Store Server API (JWT .p8) —
 *    la réponse Apple est la source de vérité (pas besoin de vérifier la chaîne de certs du payload).
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(private readonly ds: DataSource, private readonly config: ConfigService) {}

  // ===========================================================================
  // Google — Real-Time Developer Notifications (Pub/Sub push)

  /** body = { message: { data: <base64 RTDN JSON> }, subscription }. */
  async handleGoogleRtdn(body: any): Promise<void> {
    const dataB64 = body?.message?.data;
    if (!dataB64) return;
    let rtdn: any;
    try {
      rtdn = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
    } catch {
      this.logger.warn('RTDN: payload illisible');
      return;
    }
    const sub = rtdn?.subscriptionNotification;
    if (!sub) return; // on ne traite que les abonnements (les packs consommables n'ont pas de cycle)
    const purchaseToken: string = sub.purchaseToken;
    const productId: string = sub.subscriptionId;
    const type: number = sub.notificationType;
    const eventTimeMillis: string = String(rtdn?.eventTimeMillis ?? Date.now());

    const row = await this.findPlayer('android', purchaseToken);
    if (!row) {
      this.logger.warn(`RTDN: abonnement inconnu (token non mappé) product=${productId} type=${type}`);
      return;
    }

    // notificationType Google : 1 RECOVERED, 2 RENEWED, 3 CANCELED, 4 PURCHASED, 5 ON_HOLD,
    // 6 IN_GRACE_PERIOD, 7 RESTARTED, 12 REVOKED, 13 EXPIRED.
    if (type === 1 || type === 2) {
      // Renouvellement PAYANT (1 RECOVERED / 2 RENEWED) → prolonge le VIP + crédite les Cam's du mois.
      // Le RTDN ne fournit pas l'orderId du renouvellement (il faudrait la Play API) → clé synthétique
      // unique par événement. La garde (ligne ledger neuve) évite un double-crédit sur RTDN rejoué.
      const isNew = await this.insertLedger(row.playerid, 'android', productId,
        `rtdn:${purchaseToken}:${eventTimeMillis}`, purchaseToken);
      if (isNew) {
        const vipDays = await this.offerVipDays(productId);
        await this.extendVipByDays(row.playerid, vipDays);
        const cams = await this.offerCams(productId);
        await this.creditCams(row.playerid, cams);
        this.logger.log(`RTDN renouvellement player=${row.playerid} +${vipDays}j +${cams} Cam's (type=${type})`);
      }
      await this.updateSub('android', purchaseToken, null, 'active');
    } else if (type === 4 || type === 7) {
      // 4 PURCHASED : achat initial crédité par ProcessPaymentTask (client). 7 RESTARTED : réactivation
      // sans nouveau paiement. On note juste l'état actif (pas de re-crédit VIP/Cam's).
      await this.updateSub('android', purchaseToken, null, 'active');
    } else if (type === 13 || type === 12) {
      await this.revokeVip(row.playerid);
      await this.updateSub('android', purchaseToken, Date.now(), type === 12 ? 'revoked' : 'expired');
      this.logger.log(`RTDN fin abo player=${row.playerid} (type=${type})`);
    } else if (type === 3) {
      // Annulation (auto-renew off) : le VIP reste jusqu'à l'expiration → on note juste le statut.
      await this.updateSub('android', purchaseToken, null, 'canceled');
    } else if (type === 5 || type === 6) {
      await this.updateSub('android', purchaseToken, null, 'grace');
    }
  }

  // ===========================================================================
  // Apple — App Store Server Notifications V2

  /** body = { signedPayload: <JWS> }. */
  async handleAppleNotification(body: any): Promise<void> {
    const signedPayload: string = body?.signedPayload;
    if (!signedPayload) return;
    let notif: any;
    try {
      notif = decodeJwt(signedPayload); // { notificationType, subtype, data:{ signedTransactionInfo } }
    } catch {
      this.logger.warn('ASSN: signedPayload illisible');
      return;
    }
    const notificationType: string = notif?.notificationType;
    const signedTx: string | undefined = notif?.data?.signedTransactionInfo;
    if (!signedTx) return;

    let clientTx: any;
    try {
      clientTx = decodeJwt(signedTx);
    } catch {
      return;
    }
    const originalTransactionId: string = clientTx?.originalTransactionId || clientTx?.transactionId;
    const transactionId: string = clientTx?.transactionId;
    if (!originalTransactionId) return;

    const row = await this.findPlayer('ios', originalTransactionId);
    if (!row) {
      this.logger.warn(`ASSN: abonnement inconnu origTx=${originalTransactionId} type=${notificationType}`);
      return;
    }

    // Source de vérité = l'API App Store Server (re-fetch), pas le payload (non vérifié).
    const tx = await this.fetchAppleTransaction(transactionId);
    if (!tx) {
      this.logger.warn(`ASSN: transaction introuvable via API tx=${transactionId}`);
      return;
    }
    const expiresMs: number = Number(tx.expiresDate || 0);
    const revoked = Number(tx.revocationDate || 0) > 0;

    if (notificationType === 'REFUND' || notificationType === 'REVOKE' || revoked
        || notificationType === 'EXPIRED') {
      await this.revokeVip(row.playerid);
      await this.updateSub('ios', originalTransactionId, Date.now(), revoked ? 'revoked' : 'expired');
      this.logger.log(`ASSN fin abo player=${row.playerid} (${notificationType})`);
    } else if (expiresMs > 0) {
      // SUBSCRIBED / DID_RENEW / OFFER_REDEEMED / DID_CHANGE_RENEWAL_STATUS… → aligne le VIP sur l'expiry.
      await this.setVipUntilMs(row.playerid, expiresMs);
      await this.updateSub('ios', originalTransactionId, expiresMs, 'active');
      // Ledger : Apple fournit le vrai transactionId du renouvellement → orderid = transactionId
      // (dédup sur orderid), subkey = originalTransactionId (jointure playersubscription).
      const ledgerProduct: string = tx.productId || row.productid;
      const ledgerOrder: string = transactionId || `${originalTransactionId}:${expiresMs}`;
      const isNew = await this.insertLedger(row.playerid, 'ios', ledgerProduct, ledgerOrder, originalTransactionId);
      // Cam's du mois : uniquement sur un VRAI renouvellement (DID_RENEW) et une seule fois (ledger neuf).
      // L'achat initial (SUBSCRIBED/INITIAL_BUY) est crédité par ProcessPaymentTask (même transactionId
      // → déjà présent dans le ledger, donc isNew=false ici de toute façon).
      let cams = 0;
      if (isNew && notificationType === 'DID_RENEW') {
        cams = await this.offerCams(ledgerProduct);
        await this.creditCams(row.playerid, cams);
      }
      this.logger.log(`ASSN renouvellement player=${row.playerid} until=${new Date(expiresMs).toISOString()} +${cams} Cam's`);
    }
  }

  // ===========================================================================
  // Helpers DB

  private async findPlayer(platform: string, subkey: string): Promise<{ playerid: number; productid: string } | null> {
    const rows = await this.ds.query(
      'SELECT playerid, productid FROM playersubscription WHERE platform = ? AND subkey = ? LIMIT 1',
      [platform, subkey],
    );
    return rows?.[0] ?? null;
  }

  private async offerVipDays(productId: string): Promise<number> {
    const rows = await this.ds.query('SELECT vipdays FROM offer WHERE productid = ? LIMIT 1', [productId]);
    return Number(rows?.[0]?.vipdays ?? 30);
  }

  private async extendVipByDays(playerId: number, days: number): Promise<void> {
    await this.ds.query(
      'UPDATE player SET accounttype = 1, endvipts = GREATEST(COALESCE(endvipts, NOW()), NOW()) + INTERVAL ? DAY WHERE playerid = ?',
      [days, playerId],
    );
  }

  private async setVipUntilMs(playerId: number, expiresMs: number): Promise<void> {
    await this.ds.query(
      'UPDATE player SET accounttype = 1, endvipts = FROM_UNIXTIME(? / 1000) WHERE playerid = ?',
      [expiresMs, playerId],
    );
  }

  private async revokeVip(playerId: number): Promise<void> {
    await this.ds.query('UPDATE player SET endvipts = NOW() WHERE playerid = ?', [playerId]);
  }

  /**
   * Écrit une ligne de renouvellement dans le ledger paymentpoker (producttype=1 abo, validated=1).
   * Idempotent : orderid est UNIQUE → un événement rejoué ne crée pas de doublon.
   * Retourne true SEULEMENT si une ligne neuve a été insérée (affectedRows=1) — sert de garde
   * anti double-crédit pour les Cam's du mois (on ne crédite qu'à la 1re écriture de l'événement).
   */
  private async insertLedger(
    playerId: number,
    platform: string,
    productId: string,
    orderId: string,
    subkey: string,
  ): Promise<boolean> {
    const res: any = await this.ds.query(
      'INSERT INTO paymentpoker (playerid, platform, productid, producttype, orderid, subkey, validated)'
        + ' VALUES (?, ?, ?, 1, ?, ?, 1)'
        + ' ON DUPLICATE KEY UPDATE paymentpokerid = paymentpokerid',
      [playerId, platform, productId, orderId, subkey],
    );
    // mysql2 : affectedRows=1 pour un INSERT neuf, 0 quand le ON DUPLICATE ne change rien (doublon).
    return Number(res?.affectedRows ?? 0) > 0;
  }

  private async offerCams(productId: string): Promise<number> {
    const rows = await this.ds.query('SELECT camamount FROM offer WHERE productid = ? LIMIT 1', [productId]);
    return Number(rows?.[0]?.camamount ?? 0);
  }

  /** Crédite les Cam's du mois de l'abonnement (playeraccount.cams). */
  private async creditCams(playerId: number, cams: number): Promise<void> {
    if (cams > 0)
      await this.ds.query('UPDATE playeraccount SET cams = cams + ? WHERE playerid = ?', [cams, playerId]);
  }

  private async updateSub(platform: string, subkey: string, expiryMs: number | null, status: string): Promise<void> {
    if (expiryMs != null)
      await this.ds.query(
        'UPDATE playersubscription SET expiryts = ?, status = ? WHERE platform = ? AND subkey = ?',
        [expiryMs, status, platform, subkey],
      );
    else
      await this.ds.query(
        'UPDATE playersubscription SET status = ? WHERE platform = ? AND subkey = ?',
        [status, platform, subkey],
      );
  }

  // ===========================================================================
  // Apple App Store Server API (re-fetch autoritatif)

  private applePem?: string;
  private appleJwt?: { token: string; exp: number };

  private appleKeyPem(): string {
    if (!this.applePem) {
      const path = this.config.get<string>('IAP_APPLE_P8');
      if (!path) throw new Error('IAP_APPLE_P8 non configuré');
      this.applePem = fs.readFileSync(path, 'utf8');
    }
    return this.applePem;
  }

  private async appleToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.appleJwt && now < this.appleJwt.exp - 60) return this.appleJwt.token;
    const keyId = this.config.get<string>('IAP_APPLE_KEY_ID');
    const issuer = this.config.get<string>('IAP_APPLE_ISSUER_ID');
    const bundle = this.config.get<string>('IAP_APPLE_BUNDLE', 'com.campok.app');
    const key = await importPKCS8(this.appleKeyPem(), 'ES256');
    const exp = now + 1140; // < 20 min (Apple rejette un JWT dont l'exp dépasse 20 min → 401)
    const token = await new SignJWT({ bid: bundle })
      .setProtectedHeader({ alg: 'ES256', kid: keyId!, typ: 'JWT' })
      .setIssuer(issuer!)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setAudience('appstoreconnect-v1')
      .sign(key);
    this.appleJwt = { token, exp };
    return token;
  }

  /** GET la transaction chez Apple (prod puis sandbox). Retourne le payload décodé du signedTransactionInfo. */
  private async fetchAppleTransaction(transactionId: string): Promise<any | null> {
    const jwt = await this.appleToken();
    for (const host of [
      'https://api.storekit.itunes.apple.com',
      'https://api.storekit-sandbox.itunes.apple.com',
    ]) {
      const res = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.status === 404) continue; // pas dans cet environnement → essayer l'autre
      if (!res.ok) {
        // Apple renvoie un corps JSON { errorCode, errorMessage } → on le loggue pour diagnostiquer
        // (401 = JWT refusé : key id / issuer id / .p8 / bundle id incohérents, ou horloge/exp).
        let body = '';
        try { body = await res.text(); } catch { /* ignore */ }
        this.logger.warn(`App Store Server API HTTP ${res.status} (${host}) : ${body}`);
        continue; // tente l'autre environnement au cas où
      }
      const json: any = await res.json();
      const signed = json?.signedTransactionInfo;
      if (!signed) return null;
      try {
        return decodeJwt(signed);
      } catch {
        return null;
      }
    }
    return null;
  }
}
