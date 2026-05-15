import { ApiProperty } from '@nestjs/swagger';

export class CgTableDto {
  @ApiProperty({ example: 42 })
  tableId: number;

  @ApiProperty({ example: 200, description: 'Grande blind en centimes' })
  bigBlind: number;

  @ApiProperty({ example: 100, description: 'Petite blind en centimes' })
  smallBlind: number;

  @ApiProperty({ example: 1, description: '1=Texas Hold\'em, 2=Omaha, …' })
  gameType: number;

  @ApiProperty({ example: 0, description: '0=pas de vidéo, 1=vidéo activée' })
  hasVideo: number;

  @ApiProperty({ example: 'NL Hold\'em 1/2', nullable: true })
  label: string;

  @ApiProperty({ example: 0, description: '0=No Limit, 1=Pot Limit, 2=Fixed Limit' })
  limitType: number;

  @ApiProperty({ example: 9 })
  maxPlayers: number;

  @ApiProperty({ example: 2 })
  minPlayers: number;

  @ApiProperty({ example: 0, description: '0=argent réel, 1=argent fictif' })
  moneyType: number;

  @ApiProperty({ example: 5, description: 'Nombre de joueurs actuellement assis' })
  nbPlayers: number;
}
