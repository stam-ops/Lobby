import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Résultat de GameTable.getSNGTables() — GameTable_LobbySNGTableRow
 *  Fusionné depuis deux sources : gametable (tabletype=1) et tournament (starttype=1) */
export class SngTableDto {
  @ApiProperty({ example: 101, description: 'gametable.gametableid ou tournament.tournamentid' })
  tableOrTournId: number;

  @ApiProperty({ example: 'SNG 10€ - 9 joueurs' })
  label: string;

  @ApiProperty({ example: 2 })
  minPlayers: number;

  @ApiProperty({ example: 9 })
  maxPlayers: number;

  @ApiProperty({ example: 0, description: '0=réel, 1=fictif' })
  moneyType: number;

  @ApiProperty({ example: 1 })
  gameType: number;

  @ApiProperty({ example: 0 })
  limitType: number;

  @ApiProperty({ example: 0 })
  hasVideo: number;

  @ApiProperty({ example: 7, description: 'Nombre de joueurs inscrits' })
  nbPlayers: number;

  @ApiProperty({ example: 1000, description: 'Buy-in en centimes' })
  buyIn: number;

  @ApiProperty({ example: 0, description: '0=inscription, 1=en cours, 2=terminé' })
  gameState: number;

  @ApiProperty({ example: 0, description: 'tournament.subscriptionstate (0 pour gametable classique)' })
  subscriptionState: number;

  @ApiProperty({ example: 0 })
  subscriptionType: number;

  @ApiProperty({ example: 0, description: 'ClientCodes.Tournament.StructureType' })
  structureType: number;

  @ApiPropertyOptional({ example: 10, description: 'Pourcentage de rake (null pour SNG tournament)' })
  rakePercentage: number | null;
}
