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
import { AuthModule } from './auth/auth.module';
import { PlayersModule } from './players/players.module';
import { ServersModule } from './servers/servers.module';
import { NetworkModule } from './network/network.module';
import { TablesModule } from './tables/tables.module';
import { CatalogModule } from './catalog/catalog.module';
import { OpinionsModule } from './opinions/opinions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentsModule } from './payments/payments.module';
import { GamePlayersModule } from './gameplayers/gameplayers.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WebrtcModule } from './webrtc/webrtc.module';
import { GametableEntity } from './lobby/entities/gametable.entity';
import { GametablePlayerEntity } from './lobby/entities/gametable-player.entity';
import { TournamentEntity } from './lobby/entities/tournament.entity';
import { TournamentSubscriptionEntity } from './lobby/entities/tournament-subscription.entity';
import { BackofficeUserEntity } from './auth/entities/backoffice-user.entity';

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
          BackofficeUserEntity,
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
    AuthModule,
    PlayersModule,
    ServersModule,
    NetworkModule,
    TablesModule,
    CatalogModule,
    OpinionsModule,
    DashboardModule,
    PaymentsModule,
    GamePlayersModule,
    WebhooksModule,
    WebrtcModule,
  ],
})
export class AppModule {}
