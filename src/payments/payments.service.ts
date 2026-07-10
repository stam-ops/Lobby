import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentListDto, PaymentRowDto, SubscriptionListDto, SubscriptionRowDto } from './dto/payment.dto';

const toBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || Number(v) === 1;

/** Paiements one-shot (paymentpoker) et abonnements (playersubscription). */
@Injectable()
export class PaymentsService {
  constructor(private readonly dataSource: DataSource) {}

  async payments(search: string, limit: number, offset: number): Promise<PaymentListDto> {
    const like = `%${search}%`;
    const searchId = /^\d+$/.test(search) ? Number(search) : -1;
    const where = search
      ? 'WHERE pi.screenname LIKE ? OR pp.playerid = ? OR pp.orderid LIKE ?'
      : '';
    const args = search ? [like, searchId, like] : [];

    const items = await this.dataSource.query<PaymentRowDto[]>(
      `SELECT pp.paymentpokerid AS paymentPokerId, pp.ts AS ts, pp.playerid AS playerId,
              pi.screenname AS screenName, pp.platform, pp.productid AS productId,
              pp.producttype AS productType, pp.orderid AS orderId, pp.subkey AS subKey,
              pp.validated AS validated,
              (SELECT o.pricecents FROM offer o WHERE o.productid = pp.productid AND o.producttype = pp.producttype LIMIT 1) AS priceCents,
              (SELECT o.currency   FROM offer o WHERE o.productid = pp.productid AND o.producttype = pp.producttype LIMIT 1) AS currency
       FROM paymentpoker pp
       LEFT JOIN playerinfos pi ON pi.playerid = pp.playerid
       ${where}
       ORDER BY pp.paymentpokerid DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM paymentpoker pp LEFT JOIN playerinfos pi ON pi.playerid = pp.playerid ${where}`,
      args,
    );
    items.forEach((r) => {
      r.validated = toBool(r.validated);
      r.priceCents = r.priceCents == null ? null : Number(r.priceCents);
    });
    return { items, total: totalRow[0]?.total ?? 0 };
  }

  async subscriptions(search: string, limit: number, offset: number): Promise<SubscriptionListDto> {
    const like = `%${search}%`;
    const searchId = /^\d+$/.test(search) ? Number(search) : -1;
    const where = search
      ? 'WHERE pi.screenname LIKE ? OR ps.playerid = ?'
      : '';
    const args = search ? [like, searchId] : [];

    const items = await this.dataSource.query<SubscriptionRowDto[]>(
      `SELECT ps.playersubscriptionid AS playerSubscriptionId, ps.playerid AS playerId,
              pi.screenname AS screenName, ps.platform, ps.productid AS productId, ps.subkey AS subKey,
              ps.expiryts AS expiryTs, ps.status, ps.createdts AS createdTs, ps.updatedts AS updatedTs,
              (SELECT o.pricecents FROM offer o WHERE o.productid = ps.productid LIMIT 1) AS priceCents,
              (SELECT o.currency   FROM offer o WHERE o.productid = ps.productid LIMIT 1) AS currency
       FROM playersubscription ps
       LEFT JOIN playerinfos pi ON pi.playerid = ps.playerid
       ${where}
       ORDER BY ps.playersubscriptionid DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM playersubscription ps LEFT JOIN playerinfos pi ON pi.playerid = ps.playerid ${where}`,
      args,
    );
    items.forEach((r) => {
      r.expiryTs = Number(r.expiryTs);
      r.priceCents = r.priceCents == null ? null : Number(r.priceCents);
    });
    return { items, total: totalRow[0]?.total ?? 0 };
  }
}
