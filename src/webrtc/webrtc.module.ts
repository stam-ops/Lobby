import { Module } from '@nestjs/common';
import { WebrtcController } from './webrtc.controller';

@Module({
  controllers: [WebrtcController],
})
export class WebrtcModule {}
