import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GiftDto {
  @ApiProperty({ example: 1, description: 'gift.giftid' })
  giftId: number;

  @ApiProperty({ example: 'Bonus 5€' })
  prize: string;
}

export class VipItemDto {
  @ApiProperty({ example: 2, description: 'vipoffer.vipofferid' })
  vipOfferId: number;

  @ApiProperty({ example: 'Accès VIP Gold' })
  prize: string;

  @ApiProperty({ example: 30, description: 'Durée en jours' })
  nbDays: number;
}

export class ClubDto {
  @ApiProperty({ example: 10 })
  clubId: number;

  @ApiProperty({ example: 'Les Sharks' })
  clubName: string;

  @ApiProperty({ example: 'SHARK42' })
  clubCode: string;

  @ApiProperty({ example: 500, description: 'club.credits' })
  credits: number;

  @ApiProperty({ example: 0, description: 'clubplayer.clubplayerstate' })
  clubPlayerState: number;
}

export class ClubPlayerInfoDto {
  @ApiProperty({ example: 123 })
  playerId: number;

  @ApiProperty({ example: '123456789' })
  fbUid: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'JohnDoe' })
  screenName: string;

  @ApiProperty({ example: 15000, description: 'Somme des gains en centimes (peut être null si aucun gain)' })
  score: number | null;

  @ApiProperty({ example: 'REAL', description: 'player.accounttype' })
  accountType: string;

  @ApiProperty({ example: false })
  isFriend: boolean;

  @ApiProperty({ example: 1, description: 'clubplayer.clubplayerstate' })
  clubState: number;
}

export class ClubTournamentInfoDto {
  @ApiProperty({ example: 55 })
  tournamentId: number;

  @ApiProperty({ example: '2024-05-01 20:00:00' })
  startTime: string;
}

export class ClubTournamentPlayerDto {
  @ApiProperty({ example: 123 })
  playerId: number;

  @ApiProperty({ example: 'JohnDoe' })
  screenName: string;

  @ApiProperty({ example: '123456789' })
  fbUid: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'REAL' })
  accountType: string;

  @ApiProperty({ example: 0 })
  clubPlayerState: number;

  @ApiPropertyOptional({ example: 5000, description: 'wonprize.amount — null si tournoi pas encore terminé' })
  score?: number | null;
}

export class ClubTournamentOfferDto {
  @ApiProperty({ example: 20, description: 'Durée d\'un niveau en secondes' })
  levelTime: number;

  @ApiProperty({ example: 5000, description: 'Stack initial en jetons' })
  initialStack: number;

  @ApiProperty({ example: 10, description: 'Coût en crédits par joueur' })
  creditPerPlayer: number;
}

export class ThemeDto {
  @ApiProperty({ example: 'dark' })
  themeName: string;
}

export class VIPPromoDto {
  @ApiProperty({ example: 1715000000, description: 'UNIX_TIMESTAMP(promovip.endts)' })
  endTs: number;

  @ApiProperty({ example: 'PROMO2024' })
  paypalCode: string;

  @ApiProperty({ example: 'VIP 1 mois offert' })
  prize: string;
}
