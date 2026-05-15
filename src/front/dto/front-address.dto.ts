import { ApiProperty } from '@nestjs/swagger';

export class FrontAddressDto {
  @ApiProperty({ example: '192.168.1.10' })
  ip: string;

  @ApiProperty({ example: 8080 })
  port: number;
}
