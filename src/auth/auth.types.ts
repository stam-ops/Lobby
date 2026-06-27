/**
 * Types & clés de metadata partagés par le module d'auth.
 *
 * Deux populations distinctes consomment LobbyWS :
 *  - 'player' : l'app React Native, authentifiée par le hash de session (table playersession).
 *  - 'admin'  : le backoffice, authentifié par JWT (table admin) — PAS encore implémenté.
 */

export type AuthAudience = 'player' | 'admin';

/** Clé de metadata posée par @Auth(...) sur un handler/contrôleur. */
export const AUTH_KEY = 'auth:audiences';

/** Clé de metadata posée par @Public() : route accessible sans authentification. */
export const PUBLIC_KEY = 'auth:public';

/** Identité résolue, attachée à `req.user` par AuthGuard. */
export interface AuthUser {
  kind: AuthAudience;
  /** Renseigné pour kind === 'player'. */
  playerId?: number;
}
