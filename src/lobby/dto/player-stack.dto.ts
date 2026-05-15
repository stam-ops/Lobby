import { ApiProperty } from '@nestjs/swagger';

/** Résultat de GameTablePlayer.getActiveTablePlayersStacks / getActiveTournamentPlayersStacks */
export class PlayerStackDto {
  @ApiProperty({ example: 'JohnDoe', description: 'playerinfos.screenname' })
  screenName: string;

  @ApiProperty({ example: 45200, description: 'gametableplayer.stack en centimes' })
  stack: number;

  @ApiProperty({ example: 1, description: 'gametableplayer.rank — 0=en jeu, >0=éliminé (valeur = position finale)' })
  rank: number;

  @ApiProperty({ example: 123, description: 'player.playerid' })
  playerId: number;
}
