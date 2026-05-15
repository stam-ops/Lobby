import { ApiProperty } from '@nestjs/swagger';

export class LobbyConnectionDto {
  @ApiProperty({ example: '192.168.1.5' })
  ip: string;

  @ApiProperty({ example: 10 })
  weight: number;
}
