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

/**
 * Rôles backoffice.
 *
 * 'admin' / 'support' = personnel interne, accès à l'ensemble du backoffice.
 * Tout rôle EXTERNE ajouté ici (organisateurs, clubs…) doit être explicitement autorisé route par
 * route via @Roles : il est refusé partout ailleurs par DEFAULT_BACKOFFICE_ROLES.
 */
export type AdminRole = 'admin' | 'support';

/**
 * Rôles admis quand une route ne précise pas de @Roles.
 *
 * ⚠️ Sécurité — ne JAMAIS remplacer par une liste vide ni y ajouter un rôle externe. Le guard
 * traitait auparavant l'absence de @Roles comme « tout admin authentifié passe » ; 9 contrôleurs
 * (dashboard, payments, network, catalog, gameplayers, opinions, social, notifications, admin-auth)
 * n'ont aucun @Roles et auraient donc été ouverts à un futur rôle externe — CA, paiements, IP des
 * joueurs compris. On liste donc explicitement les rôles internes : ajouter un rôle à AdminRole ne
 * lui ouvre plus rien tant qu'aucun @Roles ne le nomme.
 */
export const DEFAULT_BACKOFFICE_ROLES: AdminRole[] = ['admin', 'support'];

/** Clé de metadata posée par @Roles(...) : rôles backoffice autorisés sur la route. */
export const ROLES_KEY = 'auth:roles';

/** Identité résolue, attachée à `req.user` par AuthGuard. */
export interface AuthUser {
  kind: AuthAudience;
  /** Renseigné pour kind === 'player'. */
  playerId?: number;
  /** Renseignés pour kind === 'admin'. */
  adminId?: number;
  email?: string;
  role?: AdminRole;
}

/** Payload du JWT admin. */
export interface AdminJwtPayload {
  sub: number;      // backofficeuserid
  email: string;
  role: AdminRole;
}
