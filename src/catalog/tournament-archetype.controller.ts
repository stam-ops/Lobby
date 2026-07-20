import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TournamentArchetypeService } from './tournament-archetype.service';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Catalog (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/tournament-archetypes')
export class TournamentArchetypeController {
  constructor(private readonly service: TournamentArchetypeService) {}

  // ⚠️ Doit rester AVANT toute route ':id' éventuelle.
  @Get('lookups')
  @ApiOperation({ summary: 'Listes de référence (blindes, prix, game time, clubs)' })
  lookups() {
    return this.service.lookups();
  }

  @Get()
  @ApiOperation({ summary: 'Archétypes de tournoi (avec `active` = isvalid inversé)' })
  list() {
    return this.service.list();
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Créer un archétype de tournoi' })
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Patch(':id/active')
  @Roles('admin')
  @ApiOperation({ summary: 'Activer / désactiver la planification (écrit isvalid inversé)' })
  setActive(@Param('id', ParseIntPipe) id: number, @Body() body: { active: boolean }) {
    return this.service.setActive(id, !!body?.active);
  }
}
