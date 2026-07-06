import { ApiProperty } from '@nestjs/swagger';

export class DayCountDto {
  @ApiProperty({ example: '2026-07-01' }) day: string;
  @ApiProperty() count: number;
}

export class DashboardDto {
  @ApiProperty() totalPlayers: number;
  @ApiProperty() vipPlayers: number;
  @ApiProperty() onlinePlayers: number;
  @ApiProperty({ type: [DayCountDto] }) activePerDay: DayCountDto[];
  @ApiProperty({ type: [DayCountDto] }) newPerDay: DayCountDto[];
}
