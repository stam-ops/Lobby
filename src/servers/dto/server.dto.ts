import { ApiProperty } from '@nestjs/swagger';

export class FrontServerDto {
  @ApiProperty() frontId: number;
  @ApiProperty({ nullable: true }) fqdn: string;
  @ApiProperty({ nullable: true, description: 'IPv4 (INET_NTOA)' }) ip: string;
  @ApiProperty({ description: 'Le port est inclus dans le fqdn (ex. campok.app:8443)' }) weight: number;
  @ApiProperty() maxConnection: number;
  @ApiProperty({ description: 'Front master' }) master: boolean;
  @ApiProperty({ nullable: true }) startTs: string;
  @ApiProperty({ nullable: true, description: '0 = actif' }) endTs: string;
  @ApiProperty({ description: 'Actif = endts vaut 0' }) active: boolean;
}

export class SipServerDto {
  @ApiProperty() sipServerId: number;
  @ApiProperty({ nullable: true }) name: string;
  @ApiProperty({ nullable: true, description: 'IPv4 (INET_NTOA)' }) ip: string;
  @ApiProperty() port: number;
  @ApiProperty() maxTables: number;
  @ApiProperty({ nullable: true }) fqdn: string;
  @ApiProperty({ nullable: true, description: 'Dernier heartbeat' }) lastTs: string;
  @ApiProperty({ description: 'Actif = heartbeat récent (< seuil)' }) active: boolean;
}
