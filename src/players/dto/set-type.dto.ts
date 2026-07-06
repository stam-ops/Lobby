import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class SetTypeDto {
  @ApiProperty({ enum: ['normal', 'vip', 'modo'] })
  @IsIn(['normal', 'vip', 'modo'])
  type: 'normal' | 'vip' | 'modo';

  @ApiPropertyOptional({ description: 'Date de fin VIP (ISO). Requis si type = vip.', example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  endVipTs?: string;
}
