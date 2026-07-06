import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import {
  ArchetypeDetailDto, ArchetypeRowDto, TournamentArchetypeRowDto,
  TournamentDetailDto, TournamentListDto,
} from './dto/catalog.dto';
import { Auth } from '../auth/auth.decorator';

const parseIntOpt = (v?: string): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

@ApiTags('Catalog (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('archetypes')
  @ApiOperation({ summary: 'Liste des archetypes de table' })
  @ApiResponse({ status: 200, type: [ArchetypeRowDto] })
  archetypes() {
    return this.catalog.archetypes();
  }

  @Get('archetypes/:id')
  @ApiOperation({ summary: 'Détail d\'un archetype de table' })
  @ApiResponse({ status: 200, type: ArchetypeDetailDto })
  archetype(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.archetype(id);
  }

  @Get('tournament-archetypes')
  @ApiOperation({ summary: 'Liste des archetypes de tournoi' })
  @ApiResponse({ status: 200, type: [TournamentArchetypeRowDto] })
  tournamentArchetypes() {
    return this.catalog.tournamentArchetypes();
  }

  @Get('tournaments')
  @ApiOperation({ summary: 'Liste des tournois (filtre archetypeId)' })
  @ApiQuery({ name: 'archetypeId', required: false })
  @ApiResponse({ status: 200, type: TournamentListDto })
  tournaments(
    @Query('archetypeId') archetypeId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.catalog.tournaments(parseIntOpt(archetypeId), Math.min(limit, 200), offset);
  }

  @Get('tournaments/:id')
  @ApiOperation({ summary: 'Détail d\'un tournoi (+ archetype)' })
  @ApiResponse({ status: 200, type: TournamentDetailDto })
  tournament(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.tournament(id);
  }
}
