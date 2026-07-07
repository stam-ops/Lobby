import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TablesService, TableTypeFilter } from './tables.service';
import { TableListDto } from './dto/table.dto';
import { Auth } from '../auth/auth.decorator';

const parseIntOpt = (v?: string): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

@ApiTags('Tables (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des tables (filtres type / launchstate / gamestate)' })
  @ApiQuery({ name: 'type', required: false, enum: ['camdate', 'camblitz', 'cashgame', 'private', 'tournament'] })
  @ApiQuery({ name: 'archetypeId', required: false })
  @ApiQuery({ name: 'tournamentId', required: false })
  @ApiQuery({ name: 'launchState', required: false })
  @ApiQuery({ name: 'gameState', required: false })
  @ApiResponse({ status: 200, type: TableListDto })
  list(
    @Query('type') type: TableTypeFilter,
    @Query('archetypeId') archetypeId: string,
    @Query('tournamentId') tournamentId: string,
    @Query('launchState') launchState: string,
    @Query('gameState') gameState: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.tables.list(
      type, parseIntOpt(archetypeId), parseIntOpt(tournamentId),
      parseIntOpt(launchState), parseIntOpt(gameState),
      Math.min(limit, 200), offset,
    );
  }
}
