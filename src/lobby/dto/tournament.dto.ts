import { ApiProperty } from '@nestjs/swagger';

/** Résultat de Tournament.getTournaments() — Tournament_LobbyTournamentRow */
export class TournamentDto {
  @ApiProperty({ example: 55, description: 'tournament.tournamentid' })
  tournamentId: number;

  @ApiProperty({ example: 'Sunday Major 50€' })
  label: string;

  @ApiProperty({ example: 500, description: 'tournamentarchetype.maxplayers' })
  maxPlayers: number;

  @ApiProperty({ example: 10 })
  minPlayers: number;

  @ApiProperty({ example: 243, description: 'tournament.playerscount' })
  playersCount: number;

  @ApiProperty({ example: 120, description: 'tournament.ingameplayerscount' })
  inGamePlayersCount: number;

  @ApiProperty({ example: 1, description: 'tournamentarchetype.gametype — 0=Hold\'em, 1=Omaha' })
  gameType: number;

  @ApiProperty({ example: 0, description: '0=NL, 1=PL, 2=L' })
  limitType: number;

  @ApiProperty({ example: 5000, description: 'tournamentarchetype.buyin en centimes' })
  buyIn: number;

  @ApiProperty({ example: 0, description: '0=inscription, 1=en cours, 2=terminé' })
  gameState: number;

  @ApiProperty({ example: 0, description: 'tournament.subscriptionstate' })
  subscriptionState: number;

  @ApiProperty({ example: 1715000000, description: 'UNIX_TIMESTAMP(tournament.starttime)' })
  startTime: number;

  @ApiProperty({ example: 30, description: 'tournamentarchetype.timeforsubscriptionsbeforestart (minutes)' })
  timeForSubscriptionsBeforeStart: number;

  @ApiProperty({ example: 0, description: '0=réel, 1=fictif' })
  moneyType: number;

  @ApiProperty({ example: 0 })
  hasVideo: number;

  @ApiProperty({ example: 9, description: 'tournamentarchetype.tablesize' })
  tableSize: number;

  @ApiProperty({ example: 0, description: 'ClientCodes.Tournament.StructureType' })
  structureType: number;

  @ApiProperty({ example: 0, description: 'tournamentarchetype.addonbreakindex' })
  addonBreakIndex: number;

  @ApiProperty({ example: 0, description: 'tournamentarchetype.lastlateregisterlevel' })
  lastLateRegisterLevel: number;
}
