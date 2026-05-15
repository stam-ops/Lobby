import { ApiProperty } from '@nestjs/swagger';

export class SngTableDto {
  @ApiProperty({ example: 101 })
  tableOrTournId: number;

  @ApiProperty({ example: 1000, description: 'Buy-in en centimes' })
  buyIn: number;

  @ApiProperty({ example: 0, description: '0=inscription ouverte, 1=en cours, 2=terminé' })
  gameState: number;

  @ApiProperty({ example: 1 })
  gameType: number;

  @ApiProperty({ example: 0 })
  hasVideo: number;

  @ApiProperty({ example: 'SNG 10€ - 9 joueurs', nullable: true })
  label: string;

  @ApiProperty({ example: 0 })
  limitType: number;

  @ApiProperty({ example: 9 })
  maxPlayers: number;

  @ApiProperty({ example: 2 })
  minPlayers: number;

  @ApiProperty({ example: 0 })
  moneyType: number;

  @ApiProperty({ example: 7 })
  nbPlayers: number;

  @ApiProperty({ example: 1, description: '1=régulier, 2=turbo, 3=hyper-turbo' })
  structureType: number;

  @ApiProperty({ example: 0 })
  subscriptionState: number;

  @ApiProperty({ example: 0 })
  subscriptionType: number;
}
