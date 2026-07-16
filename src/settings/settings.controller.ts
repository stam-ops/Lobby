import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { CONFIG_TABLE_NAMES } from './settings.constants';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Config (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/config')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('tables')
  @ApiOperation({ summary: 'Tables de configuration éditables' })
  tables() {
    return CONFIG_TABLE_NAMES;
  }

  @Get(':table')
  @ApiOperation({ summary: 'Valeurs + métadonnées des champs d\'une table de configuration' })
  get(@Param('table') table: string) {
    return this.settings.get(table);
  }

  @Patch(':table')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier des valeurs (colonnes whitelistées ; flags = 0/1)' })
  update(@Param('table') table: string, @Body() patch: Record<string, unknown>) {
    return this.settings.update(table, patch);
  }
}
