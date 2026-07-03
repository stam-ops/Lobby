import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export type BanType = 'site' | 'chat' | 'cam';

export class BanDto {
  @ApiProperty({ enum: ['site', 'chat', 'cam'], description: 'site=blacklist, chat=bannedplayer, cam=bannedcamall' })
  @IsIn(['site', 'chat', 'cam'])
  type: BanType;
}
