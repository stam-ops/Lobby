import { ApiProperty } from '@nestjs/swagger';

/**
 * Montants de bonus affichés côté client comme arguments d'incitation (parrainage, VIP).
 * Source : table `bonus` (une ligne par bonustype). Public : chargé au bootstrap, avant login.
 *   - sponsorBonus    (bonustype 12) → ce que gagne le parrain par filleul (P + Cam's)
 *   - dailyBonusVip   (bonustype 3)  → bonus quotidien d'un joueur VIP (P + Cam's)
 *   - monthlyBonus    (bonustype 4)  → Cam's offerts chaque mois au VIP
 */
export class BonusAmountsDto {
  @ApiProperty({ example: 5000, description: 'bonus(sponsorBonus).bankrollval — P par ami parrainé' })
  sponsorBonusP: number;

  @ApiProperty({ example: 50, description: 'bonus(sponsorBonus).cams — Cam\'s par ami parrainé' })
  sponsorBonusCams: number;

  @ApiProperty({ example: 2000, description: 'bonus(dailyBonusVip).bankrollval — P du daily VIP' })
  dailyVipBonusP: number;

  @ApiProperty({ example: 20, description: 'bonus(dailyBonusVip).cams — Cam\'s du daily VIP' })
  dailyVipBonusCams: number;

  @ApiProperty({ example: 200, description: 'bonus(monthlyBonus).cams — Cam\'s offerts/mois au VIP' })
  monthlyVipCams: number;
}
