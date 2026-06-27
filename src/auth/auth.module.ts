import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerSessionService } from './player-session.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AuthGuard } from './auth.guard';
import { BackofficeUserEntity } from './entities/backoffice-user.entity';

/**
 * Enregistre AuthGuard comme guard GLOBAL (APP_GUARD) : il s'applique à toutes les routes.
 * Défaut @Auth('player'). Les routes pré-login portent @Public() (cf. FrontController).
 *
 * - PlayerSessionService : valide le hash joueur (DataSource fourni globalement par TypeOrmModule).
 * - AdminAuthService / JwtModule : login + vérif JWT backoffice.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BackofficeUserEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-env'),
        // cast : @nestjs/jwt v11 type expiresIn via `ms` (StringValue), pas un simple string.
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '12h') as any },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [
    PlayerSessionService,
    AdminAuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
