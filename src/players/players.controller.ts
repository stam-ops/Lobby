import {
  Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlayersService, PlayerType } from './players.service';
import { PlayerDetailDto, PlayerListDto } from './dto/player-row.dto';
import { BanDto, BanType } from './dto/ban.dto';
import { SetTypeDto } from './dto/set-type.dto';
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
  @ApiQuery({ name: 'type', required: false, enum: ['normal', 'vip', 'modo'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, type: PlayerListDto })
  list(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('type') type: PlayerType,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const t = ['normal', 'vip', 'modo'].includes(type) ? type : undefined;
    return this.players.list(search.trim(), t, Math.min(limit, 200), offset);
  }

  @Patch(':id/type')
  @Roles('admin')
  @ApiOperation({ summary: 'Changer le type d\'un joueur (normal / vip / modo). VIP : date de fin requise.' })
  async setType(@Param('id', ParseIntPipe) id: number, @Body() dto: SetTypeDto) {
    await this.players.setType(id, dto.type, dto.endVipTs);
    return { ok: true };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche détail d\'un joueur' })
  @ApiResponse({ status: 200, type: PlayerDetailDto })
  @ApiResponse({ status: 404, description: 'Joueur introuvable' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.players.detail(id);
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
