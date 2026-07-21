import { SetMetadata } from '@nestjs/common';
import { AdminRole, AuthAudience, AUTH_KEY, PUBLIC_KEY, ROLES_KEY } from './auth.types';

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

/**
 * Restreint une route admin à certains rôles backoffice. À combiner avec @Auth('admin').
 *
 * Sans @Roles, la route est réservée aux rôles INTERNES (DEFAULT_BACKOFFICE_ROLES) : un rôle
 * externe — organisateur, club — n'accède donc à RIEN tant qu'une route ne le nomme pas
 * explicitement. C'est volontairement l'inverse de l'ancien comportement, où l'absence de @Roles
 * laissait passer n'importe quel admin authentifié.
 *
 *   @Auth('admin') @Roles('admin')   // admins uniquement (pas les 'support')
 *   @Auth('admin') @Roles('club')    // réservé aux organisateurs
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
