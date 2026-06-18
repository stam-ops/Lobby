import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LobbyModule } from './lobby/lobby.module';
import { FrontModule } from './front/front.module';
import { RankingModule } from './ranking/ranking.module';
import { SocialModule } from './social/social.module';
import { ClubModule } from './club/club.module';
import { TournamentModule } from './tournament/tournament.module';
import { OffersModule } from './offers/offers.module';
import { GametableEntity } from './lobby/entities/gametable.entity';
import { GametablePlayerEntity } from './lobby/entities/gametable-player.entity';
import { TournamentEntity } from './lobby/entities/tournament.entity';
import { TournamentSubscriptionEntity } from './lobby/entities/tournament-subscription.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get('DB_USERNAME', 'root'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_DATABASE', 'maindb'),
        entities: [
          GametableEntity,
          GametablePlayerEntity,
          TournamentEntity,
          TournamentSubscriptionEntity,
        ],
        synchronize: false,
      }),
    }),
    LobbyModule,
    FrontModule,
    RankingModule,
    SocialModule,
    ClubModule,
    TournamentModule,
    OffersModule,
  ],
})
export class AppModule {}
