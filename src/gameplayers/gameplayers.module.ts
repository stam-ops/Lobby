import { Module } from '@nestjs/common';
import { GamePlayersController } from './gameplayers.controller';
import { GamePlayersService } from './gameplayers.service';

@Module({
  controllers: [GamePlayersController],
  providers: [GamePlayersService],
})
export class GamePlayersModule {}
