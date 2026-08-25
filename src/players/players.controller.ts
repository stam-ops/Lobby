import {
  Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlayersService, PlayerType } from './players.service';
import { PlayerDetailDto, PlayerListDto } from './dto/player-row.dto';
import { DayCountDto } from './dto/day-count.dto';
import { BanDto, BanType } from './dto/ban.dto';
import { SetTypeDto } from './dto/set-type.dto';
import { SetBalanceDto } from './dto/set-balance.dto';
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
  @ApiQuery({ name: 'removed', required: false, enum: ['active', 'removed'] })
  @ApiQuery({ name: 'os', required: false, description: '0 = Android, 1 = iOS' })
  @ApiQuery({ name: 'signInMethod', required: false, description: '0=FB, 1=iOS, 2=tél, 3=Google' })
  @ApiQuery({ name: 'appVersion', required: false })
  @ApiQuery({ name: 'sponsorCode', required: false, description: 'Code de parrainage exact du joueur' })
  @ApiQuery({ name: 'sponsor', required: false, description: 'Parrain : playerId, code ou pseudo' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['creation', 'solde', 'cams'] })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, type: PlayerListDto })
  list(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('type') type: PlayerType,
    @Query('removed') removed: 'active' | 'removed',
    @Query('os') os: string,
    @Query('signInMethod') signInMethod: string,
    @Query('appVersion') appVersion: string,
    @Query('sponsorCode', new DefaultValuePipe('')) sponsorCode: string,
    @Query('sponsor', new DefaultValuePipe('')) sponsor: string,
    @Query('sortBy') sortBy: 'creation' | 'solde' | 'cams',
    @Query('sortDir') sortDir: 'asc' | 'desc',
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const intOpt = (v?: string) => {
      if (v === undefined || v === '') return undefined;
      const n = Number(v);
      return Number.isInteger(n) ? n : undefined;
    };
    return this.players.list({
      search: search.trim(),
      type: ['normal', 'vip', 'modo'].includes(type) ? type : undefined,
      removed: ['active', 'removed'].includes(removed) ? removed : undefined,
      os: intOpt(os),
      signInMethod: intOpt(signInMethod),
      appVersion: intOpt(appVersion),
      sponsorCode: sponsorCode.trim() || undefined,
      sponsor: sponsor.trim() || undefined,
      sortBy: ['creation', 'solde', 'cams'].includes(sortBy) ? sortBy : undefined,
      sortDir: sortDir === 'asc' ? 'asc' : 'desc',
      limit: Math.min(limit, 200),
      offset,
    });
  }

  // ⚠️ Doit rester AVANT @Get(':id') : sinon 'filters' est capté par :id (ParseIntPipe → 400).
  @Get('filters')
  @ApiOperation({ summary: 'Valeurs disponibles pour les filtres (versions d\'app présentes)' })
  filters() {
    return this.players.filterOptions();
  }

  @Patch(':id/type')
  @Roles('admin')
  @ApiOperation({ summary: 'Changer le type d\'un joueur (normal / vip / modo). VIP : date de fin requise.' })
  async setType(@Param('id', ParseIntPipe) id: number, @Body() dto: SetTypeDto) {
    await this.players.setType(id, dto.type, dto.endVipTs);
    return { ok: true };
  }

  @Patch(':id/balance')
  @Roles('admin')
  @ApiOperation({
    summary: 'Modifier MANUELLEMENT le solde de jetons (playeraccount.amount) — hors flux de jeu',
  })
  async setBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetBalanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.players.setBalance(id, Number(dto?.amount), user.adminId ?? 0, user.email);
    return { ok: true };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche détail d\'un joueur' })
  @ApiResponse({ status: 200, type: PlayerDetailDto })
  @ApiResponse({ status: 404, description: 'Joueur introuvable' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.players.detail(id);
  }

  @Get(':id/connections-per-day')
  @ApiOperation({ summary: 'Nombre de connexions par jour du joueur (7/30/90 j)' })
  @ApiQuery({ name: 'days', required: false, enum: [7, 30, 90] })
  @ApiResponse({ status: 200, type: [DayCountDto] })
  connectionsPerDay(@Param('id', ParseIntPipe) id: number, @Query('days') daysStr: string) {
    const d = Number(daysStr);
    const days = [7, 30, 90].includes(d) ? d : 30;
    return this.players.connectionsPerDay(id, days);
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
