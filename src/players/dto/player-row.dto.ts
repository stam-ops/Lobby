import { ApiProperty } from '@nestjs/swagger';

export class PlayerRowDto {
  @ApiProperty() playerId: number;
  @ApiProperty() screenName: string;
  @ApiProperty({ nullable: true }) email: string;
  @ApiProperty({ nullable: true }) firstName: string;
  @ApiProperty({ nullable: true }) lastName: string;
  @ApiProperty({ description: 'Banni du site (table blacklist)' }) siteBanned: boolean;
  @ApiProperty({ description: 'Banni du tchat (bannedplayer actif)' }) chatBanned: boolean;
  @ApiProperty({ description: 'Ban cam global (bannedcamall actif)' }) camBanned: boolean;
}

export class PlayerListDto {
  @ApiProperty({ type: [PlayerRowDto] }) items: PlayerRowDto[];
  @ApiProperty() total: number;
}
