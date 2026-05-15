import { ApiProperty } from '@nestjs/swagger';

/** Résultat de GameTable.getCGTables() — GameTable_LobbyCGTableRow */
export class CgTableDto {
  @ApiProperty({ example: 42, description: 'gametable.gametableid' })
  tableId: number;

  @ApiProperty({ example: 'NL Hold\'em 1/2', description: 'gametablearchetype.label' })
  label: string;

  @ApiProperty({ example: 2 })
  minPlayers: number;

  @ApiProperty({ example: 9 })
  maxPlayers: number;

  @ApiProperty({ example: 100, description: 'blindvalues.smallblind en centimes' })
  smallBlind: number;

  @ApiProperty({ example: 200, description: 'blindvalues.bigblind en centimes' })
  bigBlind: number;

  @ApiProperty({ example: 0, description: '0=réel, 1=fictif' })
  moneyType: number;

  @ApiProperty({ example: 1, description: '0=Hold\'em, 1=Omaha' })
  gameType: number;

  @ApiProperty({ example: 0, description: '0=NL, 1=PL, 2=L' })
  limitType: number;

  @ApiProperty({ example: 0, description: '0=pas de vidéo, 1=vidéo' })
  hasVideo: number;

  @ApiProperty({ example: 5, description: 'gametable.playerscount' })
  nbPlayers: number;
}
