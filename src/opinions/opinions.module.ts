import { Module } from '@nestjs/common';
import { OpinionsController } from './opinions.controller';
import { OpinionsService } from './opinions.service';

@Module({
  controllers: [OpinionsController],
  providers: [OpinionsService],
})
export class OpinionsModule {}
