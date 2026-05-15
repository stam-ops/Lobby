import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlayerInfoDto {
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

  @ApiProperty({ example: 'REAL', description: 'player.accounttype' })
  accountType: string;

  @ApiProperty({ example: 3200 })
  gameScore: number;

  @ApiProperty({ example: 800 })
  socialScore: number;

  @ApiPropertyOptional({ example: true, description: 'true si playerIdFrom est ami avec ce joueur' })
  isFriend?: boolean;
}

export class FriendDto {
  @ApiProperty({ example: 456 })
  playerId: number;

  @ApiProperty({ example: 'JaneDoe' })
  screenName: string;

  @ApiProperty({ example: '987654321' })
  fbUid: string;

  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 2800 })
  gameScore: number;

  @ApiProperty({ example: 600 })
  socialScore: number;
}

export class TournamentResultDto {
  @ApiProperty({ example: 'Sunday Major 50€' })
  label: string;

  @ApiProperty({ example: 243 })
  playersCount: number;

  @ApiProperty({ example: 1715000000 })
  startTime: number;

  @ApiProperty({ example: 5000, description: 'wonprize.amount en centimes' })
  amount: number;

  @ApiProperty({ example: 3, description: 'gametableplayer.rank (position finale)' })
  rank: number;
}

export class PlayerStatsDto {
  @ApiProperty({ example: 123 })
  playerId: number;

  @ApiProperty({ example: 1250, description: 'Nombre total de mains jouées' })
  nbHandTotal: number;

  @ApiProperty({ example: 180, description: 'Nombre de mains jouées cette semaine' })
  nbHandWeek: number;

  @ApiProperty({ example: 15000, description: 'Gains cash game total en centimes' })
  winCashTotal: number;

  @ApiProperty({ example: 2000, description: 'Gains cash game cette semaine en centimes' })
  winCashWeek: number;

  @ApiProperty({ example: 8000, description: 'Gains SNG total en centimes' })
  winSngTotal: number;

  @ApiProperty({ example: 1000, description: 'Gains SNG cette semaine en centimes' })
  winSngWeek: number;

  @ApiProperty({ example: 25000, description: 'Gains tournoi total en centimes' })
  winTournamentTotal: number;

  @ApiProperty({ example: 5000, description: 'Gains tournoi cette semaine en centimes' })
  winTournamentWeek: number;

  @ApiProperty({ example: 12, description: 'Nombre total de tournois joués' })
  nbTournamentTotal: number;

  @ApiProperty({ example: 2, description: 'Nombre de tournois gagnés' })
  nbWonTournamentTotal: number;

  @ApiProperty({ example: 30, description: 'Nombre total de SNG joués' })
  nbSngTotal: number;
}
