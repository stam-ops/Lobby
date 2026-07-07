import { ApiProperty } from '@nestjs/swagger';

export class DayCountDto {
  @ApiProperty({ example: '2026-07-01' }) day: string;
  @ApiProperty() count: number;
}
