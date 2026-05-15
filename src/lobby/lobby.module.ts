import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { GametableEntity } from './entities/gametable.entity';
import { GametablePlayerEntity } from './entities/gametable-player.entity';
import { TournamentEntity } from './entities/tournament.entity';
import { TournamentSubscriptionEntity } from './entities/tournament-subscription.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GametableEntity,
      GametablePlayerEntity,
      TournamentEntity,
      TournamentSubscriptionEntity,
    ]),
  ],
  controllers: [LobbyController],
  providers: [LobbyService],
})
export class LobbyModule {}
