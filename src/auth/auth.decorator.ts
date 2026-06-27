import { SetMetadata } from '@nestjs/common';
import { AuthAudience, AUTH_KEY, PUBLIC_KEY } from './auth.types';

/**
 * Restreint une route (ou un contrôleur entier) à une ou plusieurs populations.
 * La requête passe si AU MOINS UNE des audiences est satisfaite.
 *
 *   @Auth('player')            // app uniquement (session joueur valide)
 *   @Auth('admin')             // backoffice uniquement (JWT admin)
 *   @Auth('player', 'admin')   // les deux
 *
 * Sans argument, équivaut à @Auth('player').
 * Par défaut (aucun décorateur), AuthGuard exige déjà 'player' — voir AuthModule.
 */
export const Auth = (...audiences: AuthAudience[]) =>
  SetMetadata(AUTH_KEY, audiences.length ? audiences : ['player']);

/** Route accessible sans authentification (bootstrap, load balancer, healthcheck...). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
