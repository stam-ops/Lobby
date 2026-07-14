import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GamePlayersService } from './gameplayers.service';
import { GamePlayerListDto } from './dto/game-player.dto';
import { Auth } from '../auth/auth.decorator';

const parseIntOpt = (v?: string): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

@ApiTags('GamePlayers (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/game-players')
export class GamePlayersController {
  constructor(private readonly gamePlayers: GamePlayersService) {}

  @Get()
  @ApiOperation({ summary: 'Joueurs aux tables (gametableplayer) + pseudo + table' })
  @ApiQuery({ name: 'player', required: false, description: 'pseudo ou playerId' })
  @ApiQuery({ name: 'table', required: false, description: 'nom de table ou gameTableId' })
  @ApiQuery({ name: 'launchState', required: false })
  @ApiQuery({ name: 'gameState', required: false })
  @ApiQuery({ name: 'seated', required: false, description: 'true = uniquement les joueurs encore assis (endts = 0)' })
  @ApiResponse({ status: 200, type: GamePlayerListDto })
  list(
    @Query('player', new DefaultValuePipe('')) player: string,
    @Query('table', new DefaultValuePipe('')) table: string,
    @Query('launchState') launchState: string,
    @Query('gameState') gameState: string,
    @Query('seated') seated: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.gamePlayers.list(
      player.trim(), table.trim(), parseIntOpt(launchState), parseIntOpt(gameState),
      seated === 'true', Math.min(limit, 200), offset,
    );
  }
}
