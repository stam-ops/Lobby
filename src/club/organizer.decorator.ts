import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';

/**
 * Injecte l'identifiant d'organisateur de l'appelant, ou refuse la requête.
 *
 * C'est la pièce centrale du cloisonnement. Les services organisateur prennent tous cet
 * identifiant en PREMIER paramètre obligatoire : une méthode ne peut donc pas être appelée sans
 * périmètre, et un filtre oublié se voit à la compilation plutôt qu'en production.
 *
 * L'exception ici est une ceinture de sécurité : `AdminAuthService.login` refuse déjà d'émettre un
 * jeton 'club' sans organisateur, et le guard exige le rôle. Si malgré tout un jeton sans
 * périmètre atteignait un contrôleur, on refuse plutôt que de renvoyer les données de tout le
 * monde — ce que ferait un `WHERE organizerid = NULL` mal écrit, ou une requête non filtrée.
 */
export const OrganizerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || user.kind !== 'admin' || !user.organizerId) {
      throw new ForbiddenException("Aucun périmètre d'organisateur associé à ce compte.");
    }
    return user.organizerId;
  },
);
