import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { CONFIG_PAGE_KEYS } from './settings.constants';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Config (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/config')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('pages')
  @ApiOperation({ summary: 'Pages de configuration éditables' })
  pages() {
    return CONFIG_PAGE_KEYS;
  }

  @Get(':page')
  @ApiOperation({ summary: 'Valeurs + groupes/légendes d\'une page de configuration' })
  get(@Param('page') page: string) {
    return this.settings.get(page);
  }

  @Patch(':page')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier des valeurs (colonnes whitelistées ; flags = 0/1)' })
  update(@Param('page') page: string, @Body() patch: Record<string, unknown>) {
    return this.settings.update(page, patch);
  }
}
