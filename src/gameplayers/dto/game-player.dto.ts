import { ApiProperty } from '@nestjs/swagger';

export class GamePlayerRowDto {
  @ApiProperty() gameTablePlayerId: number;
  @ApiProperty() playerId: number;
  @ApiProperty({ nullable: true }) screenName: string;
  @ApiProperty() gameTableId: number;
  @ApiProperty({ nullable: true }) tableLabel: string;
  @ApiProperty({ description: 'TableType (0=cashgame,1=SNG,2=tournoi)' }) tableType: number;
  @ApiProperty({ description: 'LaunchState de la table' }) launchState: number;
  @ApiProperty({ description: 'GameState de la table' }) gameState: number;
  @ApiProperty() seatNo: number;
  @ApiProperty() stack: number;
  @ApiProperty({ description: 'TableConnectionState (0=connecté,1=déconnecté)' }) connectionState: number;
  @ApiProperty({ description: 'InGameState (-1..3)' }) inGameState: number;
  @ApiProperty({ nullable: true, description: 'Départ de table (0 = encore assis)' }) endTs: string;
}

export class GamePlayerListDto {
  @ApiProperty({ type: [GamePlayerRowDto] }) items: GamePlayerRowDto[];
  @ApiProperty() total: number;
}
