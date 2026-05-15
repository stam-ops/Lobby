import { ApiProperty } from '@nestjs/swagger';

/** Résultat de la jointure gametableplayer + playerinfos */
export class PlayerStackDto {
  @ApiProperty({ example: 1, description: 'gametableplayer.rank (1=chip leader, 0=en jeu)' })
  rank: number;

  @ApiProperty({ example: 45200, description: 'gametableplayer.stack en centimes' })
  stack: number;

  @ApiProperty({ example: 'Jean Dupont', description: 'CONCAT(playerinfos.firstname, playerinfos.lastname)' })
  screenName: string;
}
