import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OfferDto } from './dto/offer.dto';

@Injectable()
export class OffersService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Offres IAP actives, triées : packs (producttype 0) puis abonnements VIP (1), chacun par
   * sortorder. La table `offer` est un en-tête auto-suffisant (contenus dénormalisés :
   * pamount / camamount / vipdays). Le vrai prix débité vient du store via `productid` ;
   * `pricecents`/`currency` ne servent qu'à l'affichage / fallback.
   */
  async getOffers(playerId?: number): Promise<OfferDto[]> {
    // Offre achetable une seule fois (firstpurchaseonly=1) déjà payée par CE joueur → on l'exclut
    // (le starter pack n'est plus proposé après achat). Sans playerId (auth log-only) → pas de filtre.
    const params: any[] = [];
    let onceFilter = '';
    if (playerId) {
      onceFilter = `
        AND (COALESCE(firstpurchaseonly, 0) = 0 OR NOT EXISTS (
          SELECT 1 FROM paymentpoker p
          WHERE p.playerid = ? AND p.productid = offer.productid AND p.validated = 1))`;
      params.push(playerId);
    }
    const rows = await this.dataSource.query<any[]>(`
      SELECT offerid          AS offerId,
             producttype      AS productType,
             productid        AS productId,
             pricecents       AS priceCents,
             currency         AS currency,
             pamount          AS pAmount,
             camamount        AS camAmount,
             vipdays          AS vipDays,
             billingperiod    AS billingPeriod,
             savepercentage   AS savePercentage,
             isbest           AS isBest,
             labelkey         AS labelKey,
             firstpurchaseonly AS firstPurchaseOnly
      FROM offer
      -- productid <> '' AND pricecents > 0 : exclut les anciennes lignes legacy de la table
      -- (avant l'ALTER) qui, avec active DEFAULT 1 + colonnes DEFAULT 0, ressortiraient en offres à 0.
      WHERE active = 1 AND productid <> '' AND pricecents > 0${onceFilter}
      ORDER BY producttype ASC, sortorder ASC
    `, params);
    return rows.map(r => ({
      offerId:           Number(r.offerId),
      productType:       Number(r.productType),
      productId:         r.productId ?? '',
      priceCents:        Number(r.priceCents),
      currency:          r.currency ?? 'EUR',
      pAmount:           Number(r.pAmount),
      camAmount:         Number(r.camAmount),
      vipDays:           Number(r.vipDays),
      billingPeriod:     Number(r.billingPeriod),
      savePercentage:    Number(r.savePercentage),
      isBest:            Number(r.isBest) === 1,
      labelKey:          r.labelKey ?? '',
      firstPurchaseOnly: Number(r.firstPurchaseOnly) === 1,
    }));
  }
}
