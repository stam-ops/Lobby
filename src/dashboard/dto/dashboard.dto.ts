import { ApiProperty } from '@nestjs/swagger';

export class DayCountDto {
  @ApiProperty({ example: '2026-07-01' }) day: string;
  @ApiProperty() count: number;
}

export class MonthCountDto {
  @ApiProperty({ example: '2026-07' }) month: string;
  @ApiProperty() count: number;
}

export class DashboardDto {
  @ApiProperty() totalPlayers: number;
  @ApiProperty() vipPlayers: number;
  @ApiProperty() onlinePlayers: number;
  @ApiProperty({ description: 'Montant validé du mois en cours (centimes)' }) monthRevenueCents: number;
  @ApiProperty({ description: 'Comptes du Chance-o-mètre' }) chanceUsers: number;
  @ApiProperty({ description: 'Paiements de l’offre Analyse du Chance-o-mètre, mois en cours (centimes)' }) chanceAnalyseMonthCents: number;
  @ApiProperty({ type: [DayCountDto] }) activePerDay: DayCountDto[];
  @ApiProperty({ type: [DayCountDto] }) newPerDay: DayCountDto[];
}
