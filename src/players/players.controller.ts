import {
  Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlayersService } from './players.service';
import { PlayerListDto } from './dto/player-row.dto';
import { BanDto, BanType } from './dto/ban.dto';
import { Auth, Roles } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

@ApiTags('Players (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des joueurs (recherche + pagination) avec statut de ban' })
  @ApiQuery({ name: 'search', required: false, description: 'screenname, email ou playerId' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, type: PlayerListDto })
  list(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.players.list(search.trim(), Math.min(limit, 200), offset);
  }

  @Post(':id/ban')
  @Roles('admin')
  @ApiOperation({ summary: 'Bannir un joueur (site / chat / cam)' })
  async ban(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BanDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.players.ban(id, dto.type, user.adminId);
    return { ok: true };
  }

  @Delete(':id/ban/:type')
  @Roles('admin')
  @ApiOperation({ summary: 'Lever un ban chat/cam (le ban site n\'est pas réversible)' })
  async unban(
    @Param('id', ParseIntPipe) id: number,
    @Param('type') type: BanType,
  ) {
    await this.players.unban(id, type);
    return { ok: true };
  }
}
