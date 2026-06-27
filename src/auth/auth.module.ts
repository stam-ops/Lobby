import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlayerSessionService } from './player-session.service';
import { AuthGuard } from './auth.guard';

/**
 * Enregistre AuthGuard comme guard GLOBAL (APP_GUARD) : il s'applique donc à toutes les routes,
 * sans avoir à annoter chacune. Le défaut est @Auth('player'). Les routes de bootstrap
 * (pré-login) doivent porter @Public() — cf. FrontController.
 *
 * DataSource est fourni globalement par TypeOrmModule (app.module), donc PlayerSessionService
 * peut l'injecter ici sans import supplémentaire.
 */
@Module({
  providers: [
    PlayerSessionService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
