import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PlayerSessionService } from './player-session.service';
import { AuthAudience, AUTH_KEY, PUBLIC_KEY } from './auth.types';

/**
 * Guard global. Pour chaque route (sauf @Public), tente d'authentifier l'appelant selon les
 * audiences exigées par @Auth(...) (défaut : 'player').
 *
 * Mode de déploiement piloté par AUTH_ENFORCE :
 *  - AUTH_ENFORCE != 'true'  → MODE LOG ONLY (défaut) : on n'interdit RIEN. Si l'auth échouerait,
 *    on log un warning [AUTH log-only] et on laisse passer. Permet de déployer côté serveur AVANT
 *    que l'app n'envoie le hash, et de mesurer le trafic non authentifié.
 *  - AUTH_ENFORCE == 'true'  → on rejette (401) les requêtes non authentifiées.
 *
 * Dans les deux cas, quand l'auth réussit, `req.user` est renseigné (cf. @CurrentUser()).
 *
 * 'admin' n'est pas encore implémenté : une route 'admin'-only est traitée comme non
 * authentifiable (log-only laisse passer, enforce rejette).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly enforce: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: PlayerSessionService,
    config: ConfigService,
  ) {
    this.enforce = config.get('AUTH_ENFORCE', 'false') === 'true';
    this.logger.log(`AuthGuard actif — mode ${this.enforce ? 'ENFORCE (401)' : 'LOG ONLY'}`);
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

    const req = ctx.switchToHttp().getRequest();
    const token = this.extractToken(req);

    if (audiences.includes('player') && token) {
      const playerId = await this.sessions.resolvePlayerId(token);
      if (playerId) req.user = { kind: 'player', playerId };
    }
    // 'admin' : à implémenter (AdminJwtGuard) — aucune route admin pour l'instant.

    if (req.user) return true;

    const detail =
      `${req.method} ${req.originalUrl ?? req.url} ` +
      `(audiences=${audiences.join('|')}, token=${token ? 'présent mais invalide' : 'absent'})`;

    if (this.enforce) {
      throw new UnauthorizedException('Session invalide ou absente');
    }
    this.logger.warn(`[AUTH log-only] rejetterait : ${detail}`);
    return true;
  }

  /** Bearer header en priorité ; fallback query param `sessionHash` pour la transition. */
  private extractToken(req: any): string | null {
    const header: string | undefined = req.headers?.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
    const q = req.query?.sessionHash;
    return typeof q === 'string' && q ? q : null;
  }
}
