import { ApiProperty } from '@nestjs/swagger';

export class ArchetypeRowDto {
  @ApiProperty() id: number;
  @ApiProperty({ nullable: true }) label: string;
  @ApiProperty({ nullable: true, description: 'ArchetypeType (1=CamDate,2=CamBlitz,3=CG,4=CG privée)' }) archetypeType: number;
  @ApiProperty({ description: 'TableType' }) tableType: number;
  @ApiProperty() buyIn: number;
  @ApiProperty() maxPlayers: number;
  @ApiProperty() hasVideo: number;
  @ApiProperty() isValid: number;
}

export class ArchetypeDetailDto extends ArchetypeRowDto {
  @ApiProperty() minPlayers: number;
  @ApiProperty() moneyType: number;
  @ApiProperty() gameType: number;
  @ApiProperty() limitType: number;
  @ApiProperty() initStack: number;
  @ApiProperty({ nullable: true }) blindStructureId: number;
  @ApiProperty({ nullable: true }) prizeStructureId: number;
  @ApiProperty({ nullable: true }) gameTimeId: number;
  @ApiProperty({ nullable: true }) clientId: number;
}

export class TournamentRowDto {
  @ApiProperty() id: number;
  @ApiProperty({ nullable: true }) label: string;
  @ApiProperty({ nullable: true }) startTime: string;
  @ApiProperty() launchState: number;
  @ApiProperty() subscriptionState: number;
  @ApiProperty() gameState: number;
  @ApiProperty() playersCount: number;
  @ApiProperty() inGamePlayersCount: number;
  @ApiProperty() tournamentArchetypeId: number;
}

export class TournamentListDto {
  @ApiProperty({ type: [TournamentRowDto] }) items: TournamentRowDto[];
  @ApiProperty() total: number;
}

export class TournamentDetailDto extends TournamentRowDto {
  @ApiProperty({ nullable: true }) archetypeLabel: string;
  @ApiProperty({ nullable: true }) description: string;
  @ApiProperty({ nullable: true }) archetypeType: number;
  @ApiProperty() buyIn: number;
  @ApiProperty() moneyType: number;
  @ApiProperty() gameType: number;
  @ApiProperty() limitType: number;
  @ApiProperty() structureType: number;
  @ApiProperty() startType: number;
  @ApiProperty() minPlayers: number;
  @ApiProperty() maxPlayers: number;
  @ApiProperty() tableSize: number;
  @ApiProperty() hasVideo: number;
  @ApiProperty() initStack: number;
  @ApiProperty() minLevel: number;
}
