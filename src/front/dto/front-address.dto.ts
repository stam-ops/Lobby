import { ApiProperty } from '@nestjs/swagger';

export class FrontAddressDto {
  @ApiProperty({ example: '192.168.1.10', description: 'INET_NTOA(front.ip)' })
  ip: string;

  @ApiProperty({ example: 'stam.app:8443', description: 'front.fqdn' })
  fqdn: string;
}
