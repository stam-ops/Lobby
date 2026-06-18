import { ApiProperty } from '@nestjs/swagger';

/** Une offre IAP : pack consommable (P + Cam's) ou abonnement VIP. */
export class OfferDto {
  @ApiProperty({ example: 4 })
  offerId: number;

  @ApiProperty({ example: 0, description: '0 = pack consommable, 1 = abonnement VIP' })
  productType: number;

  @ApiProperty({ example: 'pack_999', description: 'SKU store (App Store / Play Store) — le vrai prix localisé vient du SDK IAP' })
  productId: string;

  @ApiProperty({ example: 999, description: 'Prix de référence en centimes (affichage / fallback ; le store fait foi)' })
  priceCents: number;

  @ApiProperty({ example: 'EUR' })
  currency: string;

  @ApiProperty({ example: 16000, description: 'P crédités (0 pour le VIP)' })
  pAmount: number;

  @ApiProperty({ example: 36, description: "Cam's crédités (par cycle mensuel pour le VIP)" })
  camAmount: number;

  @ApiProperty({ example: 0, description: 'Jours VIP crédités (0 pour un pack)' })
  vipDays: number;

  @ApiProperty({ example: 0, description: '0 = aucun (pack), 1 = mensuel, 2 = annuel' })
  billingPeriod: number;

  @ApiProperty({ example: 28, description: 'Badge « +X% » (valeur croissante avec le palier)' })
  savePercentage: number;

  @ApiProperty({ example: true, description: 'Offre mise en avant dans la popup' })
  isBest: boolean;

  @ApiProperty({ example: 'offerPopular', description: "Clé i18n du libellé (vide si aucun)" })
  labelKey: string;

  @ApiProperty({ example: false, description: "Offre limitée au 1er achat (starter)" })
  firstPurchaseOnly: boolean;
}
