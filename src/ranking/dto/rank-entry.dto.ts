import { ApiProperty } from '@nestjs/swagger';

export class RankEntryDto {
  @ApiProperty({ example: 'JohnDoe' })
  screenName: string;

  @ApiProperty({ example: '123456789' })
  fbUid: string;

  @ApiProperty({ example: 15000, description: 'Score agrégé (somme des gains en centimes)' })
  score: number;

  @ApiProperty({ example: 5, description: 'Nombre de parties gagnées' })
  nb: number;

  @ApiProperty({ example: 4200 })
  gameScore: number;
}

export class PlayerRankRowDto {
  @ApiProperty({ example: 42 })
  playerId: number;

  @ApiProperty({ example: 'JohnDoe' })
  screenName: string;

  @ApiProperty({ example: '123456789' })
  fbUid: string;

  @ApiProperty({ example: 3000 })
  gameScore: number;

  @ApiProperty({ example: 500 })
  socialScore: number;

  @ApiProperty({ example: 'REAL', description: 'player.accounttype' })
  accountType: string;

  @ApiProperty({ example: 1715000000, description: 'UNIX_TIMESTAMP(player.endvipts)' })
  endVipTs: number | null;

  @ApiProperty({ example: 0, description: 'player.subscription' })
  subscription: number;
}

export class PlayerRankingDto {
  @ApiProperty({ example: 17, description: 'Rang global du joueur' })
  rank: number;

  @ApiProperty({ type: PlayerRankRowDto, description: 'Données du joueur cible' })
  player: PlayerRankRowDto;

  @ApiProperty({ type: [PlayerRankRowDto], description: 'Joueurs mieux classés (jusqu\'à nBefore)' })
  before: PlayerRankRowDto[];

  @ApiProperty({ type: [PlayerRankRowDto], description: 'Joueurs moins bien classés (jusqu\'à nAfter)' })
  after: PlayerRankRowDto[];
}

export class DailyResultDto {
  @ApiProperty({ example: 'JohnDoe' })
  screenName: string;

  @ApiProperty({ example: '123456789' })
  fbUid: string;

  @ApiProperty({ example: 5000, description: 'wonprize.amount en centimes' })
  amount: number;

  @ApiProperty({ example: 1, description: 'gametableplayer.rank' })
  rank: number;

  @ApiProperty({ example: 3200 })
  gameScore: number;

  @ApiProperty({ example: 'Bonus 10€', description: 'prize.label' })
  lot: string;
}
