import { ApiProperty } from '@nestjs/swagger';

/** Ligne de la liste des tables (gametable). Codes bruts, libellés côté front. */
export class TableRowDto {
  @ApiProperty() gameTableId: number;
  @ApiProperty({ nullable: true }) label: string;
  @ApiProperty({ description: 'campok.client.codes.gametable.LaunchState' }) launchState: number;
  @ApiProperty({ description: 'campok.client.codes.gametable.GameState' }) gameState: number;
  @ApiProperty() playersCount: number;
  @ApiProperty({ nullable: true }) gameTableArchetypeId: number;
  @ApiProperty({ nullable: true, description: 'ArchetypeType : 1=CamDate,2=CamBlitz,3=CashGame,4=CashGame privée' })
  archetypeType: number;
  @ApiProperty({ nullable: true }) tournamentId: number;
  @ApiProperty({ nullable: true, description: 'IP serveur cam (int)' }) camServerIp: number;
  @ApiProperty({ nullable: true, description: 'IP serveur cam lisible' }) camServerIpStr: string;
  @ApiProperty({ nullable: true, description: 'Propriétaire (cash game privée)' }) ownerPlayerId: number;
  @ApiProperty({ nullable: true }) ownerScreenName: string;
}

export class TableListDto {
  @ApiProperty({ type: [TableRowDto] }) items: TableRowDto[];
  @ApiProperty() total: number;
}
