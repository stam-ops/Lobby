import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { BlacklistController } from './blacklist.controller';
import { BlacklistService } from './blacklist.service';

@Module({
  controllers: [PlayersController, BlacklistController],
  providers: [PlayersService, BlacklistService],
})
export class PlayersModule {}
