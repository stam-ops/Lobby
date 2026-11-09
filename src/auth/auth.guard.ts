import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { PlayerSessionService } from './player-session.service';
import { AdminAuthService } from './admin-auth.service';
import {
  AdminRole, AuthAudience, AUTH_KEY, DEFAULT_BACKOFFICE_ROLES, PUBLIC_KEY, ROLES_KEY, STRICT_KEY,
} from './auth.types';

/**
 * Guard global. Pour chaque route (sauf @Public), tente d'authentifier l'appelant selon les
 * audiences exigées par @Auth(...) (défaut : 'player').
 *
 * Deux identités possibles, toutes deux via `Authorization: Bearer <token>` :
 *  - admin  : le token est un JWT (vérifié par AdminAuthService) → req.user.kind = 'admin'.
 *  - player : le token est un hash de session (table playersession)  → req.user.kind = 'player'.
 * Une route @Auth('player','admin') accepte les deux. On tente le JWT en premier (pas de DB),
 * puis le hash joueur (lookup DB) en repli.
 *
 * Mode de déploiement piloté par AUTH_ENFORCE :
 *  - != 'true' → LOG ONLY (défaut) : n'interdit RIEN, log les requêtes qui seraient rejetées.
 *  - == 'true' → rejette (401/403).
 *
 * Note : le contrôle de rôle (@Roles) est TOUJOURS appliqué quand l'admin est authentifié,
 * y compris en log-only (un mauvais rôle = échec d'auth, donc logué/rejeté selon le mode).
 *
 * Troisième identité, 'partner' : la clé CHANCE_PARTNER_KEY (32 caractères au moins), comparée à
 * temps constant → req.user.kind = 'partner'. Une route qui accepte 'partner', ou marquée @Strict(),
 * est TOUJOURS en mode ENFORCE : ces routes sont nouvelles, aucune app en circulation ne dépend du
 * log-only, et elles touchent aux comptes du Chance-o-mètre.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly enforce: boolean;
  /** Empreinte de la clé partenaire, ou null si elle n'est pas définie (routes 'partner' fermées). */
  private readonly partnerKey: Buffer | null;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: PlayerSessionService,
    private readonly adminAuth: AdminAuthService,
    config: ConfigService,
  ) {
    this.enforce = config.get('AUTH_ENFORCE', 'false') === 'true';
    this.logger.log(`AuthGuard actif — mode ${this.enforce ? 'ENFORCE (401/403)' : 'LOG ONLY'}`);
    const key = config.get<string>('CHANCE_PARTNER_KEY', '');
    if (key && key.length < 32) {
      this.logger.error('CHANCE_PARTNER_KEY trop courte (32 caractères minimum) — routes partenaire fermées.');
    }
    this.partnerKey = key.length >= 32 ? createHash('sha256').update(key).digest() : null;
  }

  /** Compare les empreintes (longueur fixe) : timingSafeEqual ne fuit ni le contenu ni la longueur. */
  private isPartner(token: string): boolean {
    if (!this.partnerKey) return false;
    return timingSafeEqual(createHash('sha256').update(token).digest(), this.partnerKey);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const audiences: AuthAudience[] =
      this.reflector.getAllAndOverride<AuthAudience[]>(AUTH_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? ['player'];

    // Sans @Roles explicite, on retombe sur les rôles INTERNES uniquement (deny-by-default pour
    // tout rôle externe) — cf. DEFAULT_BACKOFFICE_ROLES.
    const requiredRoles: AdminRole[] =
      this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? DEFAULT_BACKOFFICE_ROLES;

    const req = ctx.switchToHttp().getRequest();
    const partnerRoute = audiences.includes('partner');
    const strict = partnerRoute || this.reflector.getAllAndOverride<boolean>(STRICT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) === true;
    // Route partenaire : clé dans l'en-tête seulement (jamais dans l'URL, qui finit dans les journaux).
    const token = partnerRoute ? this.headerToken(req) : this.extractToken(req);

    let forbiddenRole = false;

    if (token) {
      if (audiences.includes('admin')) {
        const payload = await this.adminAuth.verifyToken(token);
        if (payload) {
          if (requiredRoles.length && !requiredRoles.includes(payload.role)) {
            forbiddenRole = true; // JWT valide mais rôle insuffisant
          } else {
            req.user = {
              kind: 'admin', adminId: payload.sub, email: payload.email, role: payload.role,
              organizerId: payload.organizerId,
            };
          }
        }
      }
      if (!req.user && partnerRoute && this.isPartner(token)) {
        req.user = { kind: 'partner' };
      }
      if (!req.user && audiences.includes('player')) {
        const playerId = await this.sessions.resolvePlayerId(token);
        if (playerId) req.user = { kind: 'player', playerId };
      }
    }

    if (req.user) return true;

    const reason = forbiddenRole
      ? `rôle insuffisant (requis: ${requiredRoles.join('|')})`
      : token
        ? 'token présent mais invalide'
        : 'token absent';
    const detail = `${req.method} ${req.originalUrl ?? req.url} (audiences=${audiences.join('|')}, ${reason})`;

    if (this.enforce || strict) {
      if (forbiddenRole) throw new ForbiddenException('Rôle insuffisant');
      throw new UnauthorizedException('Session invalide ou absente');
    }
    this.logger.warn(`[AUTH log-only] rejetterait : ${detail}`);
    return true;
  }

  private headerToken(req: any): string | null {
    const header: string | undefined = req.headers?.authorization;
    return header && header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
  }

  /** Bearer header en priorité ; fallback query param `sessionHash` pour la transition app. */
  private extractToken(req: any): string | null {
    const header = this.headerToken(req);
    if (header) return header;
    const q = req.query?.sessionHash;
    return typeof q === 'string' && q ? q : null;
  }
}
