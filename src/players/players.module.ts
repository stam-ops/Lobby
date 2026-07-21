import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { BlacklistController } from './blacklist.controller';
import { BlacklistService } from './blacklist.service';
import { NotificationsSentController } from './notifications-sent.controller';
import { NotificationsSentService } from './notifications-sent.service';

@Module({
  controllers: [PlayersController, BlacklistController, NotificationsSentController],
  providers: [PlayersService, BlacklistService, NotificationsSentService],
})
export class PlayersModule {}
