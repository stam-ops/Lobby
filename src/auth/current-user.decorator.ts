import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth.types';

/**
 * Injecte l'identité résolue par AuthGuard.
 *
 *   getStats(@CurrentUser() user: AuthUser) { ... user.playerId ... }
 *
 * En mode "log only" (AUTH_ENFORCE!=true), `user` peut être undefined même sur une route
 * 'player' si l'app n'envoie pas encore le hash : prévoir ce cas tant que le rollout n'est
 * pas terminé.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
