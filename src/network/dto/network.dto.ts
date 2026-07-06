import { ApiProperty } from '@nestjs/swagger';

export class SessionRowDto {
  @ApiProperty() playerSessionId: number;
  @ApiProperty({ nullable: true }) playerId: number;
  @ApiProperty({ nullable: true }) screenName: string;
  @ApiProperty({ nullable: true }) startTs: string;
  @ApiProperty({ nullable: true }) endTs: string;
  @ApiProperty({ description: 'Session ouverte' }) opened: boolean;
  @ApiProperty({ description: 'IP en int (pour blacklist)' }) ip: number;
  @ApiProperty({ nullable: true, description: 'IPv4 lisible' }) ipStr: string;
  @ApiProperty({ description: 'IP présente dans blacklist' }) ipBlacklisted: boolean;
}

export class SessionListDto {
  @ApiProperty({ type: [SessionRowDto] }) items: SessionRowDto[];
  @ApiProperty() total: number;
}

export class ConnectionRowDto {
  @ApiProperty() connectionId: number;
  @ApiProperty() ip: number;
  @ApiProperty({ nullable: true }) ipStr: string;
  @ApiProperty({ nullable: true }) websocketId: string;
  @ApiProperty() frontId: number;
  @ApiProperty({ nullable: true }) playerSessionId: number;
  @ApiProperty({ nullable: true }) startTs: string;
  @ApiProperty({ nullable: true }) endTs: string;
  @ApiProperty({ nullable: true }) endState: number;
  @ApiProperty({ description: 'IP présente dans blacklist' }) ipBlacklisted: boolean;
}

export class ConnectionListDto {
  @ApiProperty({ type: [ConnectionRowDto] }) items: ConnectionRowDto[];
  @ApiProperty() total: number;
}

export class SessionDetailDto extends SessionRowDto {
  @ApiProperty({ type: [ConnectionRowDto] }) connections: ConnectionRowDto[];
}
