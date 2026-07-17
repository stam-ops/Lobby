import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientVersionService } from './client-version.service';
import { Auth, Roles } from '../auth/auth.decorator';

/** Chemin distinct de /admin/config/:table (table multi-lignes, sémantique par OS). */
@ApiTags('Config (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/client-version')
export class ClientVersionController {
  constructor(private readonly clientVersion: ClientVersionService) {}

  @Get()
  @ApiOperation({ summary: 'Version requise par plateforme (seuil = MAX(requiredversion) par os)' })
  get() {
    return this.clientVersion.get();
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Ajouter une version au catalogue (INSERT)' })
  add(@Body() body: { os: number; requiredVersion: number; description?: string; currentVersion?: string }) {
    return this.clientVersion.addVersion({
      os: Number(body?.os),
      requiredVersion: Number(body?.requiredVersion),
      description: body?.description,
      currentVersion: body?.currentVersion,
    });
  }

  @Patch()
  @Roles('admin')
  @ApiOperation({
    summary: 'Définir le minimum requis d\'une plateforme (os: 0=Android, 1=iOS). '
      + 'Supprime les versions au-dessus / insère la ligne manquante pour que MAX == cible.',
  })
  set(@Body() body: { os: number; requiredVersion: number }) {
    return this.clientVersion.setMinimumVersion(Number(body?.os), Number(body?.requiredVersion));
  }
}
