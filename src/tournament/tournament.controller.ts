import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TournamentService } from './tournament.service';
import {
  SngStaticInfoDto, TournamentStaticInfoDto, TournamentDynamicInfoDto,
  TournamentBlindStructureDto, TournamentTableDto, TournamentBlindInfoDto,
  ArchetypeDto, TablesPlayersCountDto, MixedSNGMissingPlayersDto,
  TournamentPrizeStructureDto, EventPlayerDto, CGArchetypeTableDto,
} from './dto/tournament-detail.dto';

@ApiTags('Tournament Details')
@Controller('tournaments')
export class TournamentController {
  constructor(private readonly svc: TournamentService) {}

  @ApiOperation({ summary: 'Infos statiques d\'une table SNG (GameTable.java → getSNGStaticInfo)' })
  @ApiParam({ name: 'id', type: Number, example: 101 })
  @ApiQuery({ name: 'type', type: Number, example: 0, description: '0=gametable SNG, 1=tournament SNG' })
  @ApiResponse({ status: 200, type: SngStaticInfoDto })
  @Get('sng/:id/static')
  getStaticSNGInfo(
    @Param('id', ParseIntPipe) id: number,
    @Query('type', new ParseIntPipe({ optional: true })) type = 0,
  ) {
    return this.svc.getStaticSNGInfo(id, type);
  }

  @ApiOperation({ summary: 'Infos statiques d\'un tournoi (Tournament.java → getTournamentStaticInfos)' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiResponse({ status: 200, type: TournamentStaticInfoDto })
  @Get(':id/static')
  getStaticTournamentInfo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getStaticTournamentInfo(id);
  }

  @ApiOperation({ summary: 'Infos dynamiques d\'un tournoi (Tournament.java → getTournamentDynamicInfos)' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiResponse({ status: 200, type: TournamentDynamicInfoDto })
  @Get(':id/dynamic')
  getDynamicTournamentInfo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDynamicTournamentInfo(id);
  }

  @ApiOperation({ summary: 'Structure des blinds d\'un tournoi (Tournament.java → getTournamentBlindStructure)' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiResponse({ status: 200, type: TournamentBlindStructureDto })
  @Get(':id/blind-structure')
  getTournamentBlindStructure(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTournamentBlindStructure(id);
  }

  @ApiOperation({ summary: 'Structure des prix d\'un tournoi (Tournament.java → getTournamentPrizeStructure)' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiResponse({ status: 200, type: TournamentPrizeStructureDto })
  @Get(':id/prize-structure')
  getTournamentPrizeStructure(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTournamentPrizeStructure(id);
  }

  @ApiOperation({ summary: 'Tables actives d\'un tournoi (Tournament.java → getTablesTournamentInfo)' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiResponse({ status: 200, type: [TournamentTableDto] })
  @Get(':id/tables')
  getTournamentTables(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTournamentTables(id);
  }

  @ApiOperation({ summary: 'Prize pool courant d\'un tournoi à partir d\'un tableId (popup info sur la table)' })
  @ApiParam({ name: 'tableId', type: Number, example: 1234 })
  @Get('by-table/:tableId/prize-pool')
  getPrizePoolByTable(@Param('tableId', ParseIntPipe) tableId: number) {
    return this.svc.getPrizePoolByTable(tableId);
  }

  @ApiOperation({ summary: 'Statut du héros dans un tournoi (actif / éliminé + rang) — badge « Éliminé »' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiQuery({ name: 'playerId', type: Number })
  @Get(':id/hero-status')
  getHeroTournamentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('playerId', ParseIntPipe) playerId: number,
  ) {
    return this.svc.getHeroTournamentStatus(id, playerId);
  }

  @ApiOperation({ summary: 'Info blind en cours d\'un tournoi (Tournament.java → getTournamentBlindInfo)' })
  @ApiParam({ name: 'id', type: Number, example: 55 })
  @ApiResponse({ status: 200, type: TournamentBlindInfoDto })
  @Get(':id/blind-info')
  getTournamentBlindInfo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTournamentBlindInfo(id);
  }

  // ── Archetypes & subscriptions ────────────────────────────────────────────

  @ApiOperation({ summary: 'Archetypes SNG/MixedSNG auxquels on peut s\'inscrire (TableArchetype.java)' })
  @ApiResponse({ status: 200, type: [ArchetypeDto] })
  @Get('archetypes/subscribable')
  getSubscribableTableArchetypes() {
    return this.svc.getSubscribableTableArchetypes();
  }

  @ApiOperation({ summary: 'Nb inscrits en attente pour un archetype SNG public (TableArchetype.java)' })
  @ApiParam({ name: 'archetypeId', type: Number, example: 2 })
  @ApiResponse({ status: 200, schema: { example: { count: 5 } } })
  @Get('archetypes/:archetypeId/waiting')
  getPublicSNGTableWaitingSubscriptions(@Param('archetypeId', ParseIntPipe) archetypeId: number) {
    return this.svc.getPublicSNGTableWaitingSubscriptions(archetypeId);
  }

  @ApiOperation({ summary: 'Nb tables pending Mixed SNG (TableArchetype.java → getMixedSNGPendingTablesCount)' })
  @ApiParam({ name: 'archetypeId', type: Number, example: 3 })
  @ApiQuery({ name: 'sex', type: Number, example: 1, description: '1=homme, 2=femme' })
  @ApiResponse({ status: 200, schema: { example: { count: 2 } } })
  @Get('archetypes/:archetypeId/mixed-pending')
  getMixedSNGPendingTablesCount(
    @Param('archetypeId', ParseIntPipe) archetypeId: number,
    @Query('sex', ParseIntPipe) sex: number,
  ) {
    return this.svc.getMixedSNGPendingTablesCount(sex, archetypeId);
  }

  @ApiOperation({ summary: 'Nb tables pending Mixed SNG pour un joueur inscrit (TableArchetype.java)' })
  @ApiParam({ name: 'archetypeId', type: Number, example: 3 })
  @ApiQuery({ name: 'sex', type: Number, example: 1 })
  @ApiQuery({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, schema: { example: { count: 1 } } })
  @Get('archetypes/:archetypeId/mixed-pending-subscribed')
  getMixedSNGPendingTablesCountSubscribed(
    @Param('archetypeId', ParseIntPipe) archetypeId: number,
    @Query('sex', ParseIntPipe) sex: number,
    @Query('playerId', ParseIntPipe) playerId: number,
  ) {
    return this.svc.getMixedSNGPendingTablesCountSubscribed(sex, archetypeId, playerId);
  }

  @ApiOperation({ summary: 'Joueurs manquants pour former la prochaine table Mixed SNG (TableArchetype.java)' })
  @ApiParam({ name: 'archetypeId', type: Number, example: 3 })
  @ApiQuery({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: MixedSNGMissingPlayersDto })
  @Get('archetypes/:archetypeId/mixed-missing')
  getMixedGendersSNGNextTableMissingPlayers(
    @Param('archetypeId', ParseIntPipe) archetypeId: number,
    @Query('playerId', ParseIntPipe) playerId: number,
  ) {
    return this.svc.getMixedGendersSNGNextTableMissingPlayers(archetypeId, playerId);
  }

  @ApiOperation({ summary: 'Infos d\'un archetype de cash game (GameTableArchetype.java → getCGArchetypeTable)' })
  @ApiParam({ name: 'archetypeId', type: Number, example: 1 })
  @ApiResponse({ status: 200, type: CGArchetypeTableDto })
  @Get('archetypes/:archetypeId/cg')
  getCGArchetypeTable(@Param('archetypeId', ParseIntPipe) archetypeId: number) {
    return this.svc.getCGArchetypeTable(archetypeId);
  }

  // ── Players & tables counts ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Joueurs connectés à la plateforme (Player.java → getEventPlayers)' })
  @ApiResponse({ status: 200, type: [EventPlayerDto] })
  @Get('event-players')
  getEventPlayers() {
    return this.svc.getEventPlayers();
  }

  @ApiOperation({ summary: 'Joueurs Facebook en ligne (Facebook.java → getOnlineFacebookAppUsers)' })
  @ApiBody({ schema: { example: { fbUids: ['123456789', '987654321'] } } })
  @ApiResponse({ status: 200, type: [EventPlayerDto] })
  @Post('facebook-online')
  getOnlineFacebookAppUsers(@Body('fbUids') fbUids: string[]) {
    return this.svc.getOnlineFacebookAppUsers(fbUids ?? []);
  }

  @ApiOperation({ summary: 'Nb joueurs par table (GameTable.java → getTablesPlayersCount)' })
  @ApiBody({ schema: { example: { tableIds: [12, 15, 23] } } })
  @ApiResponse({ status: 200, type: [TablesPlayersCountDto] })
  @Post('players-count')
  getTablesPlayersCount(@Body('tableIds') tableIds: number[]) {
    return this.svc.getTablesPlayersCount(tableIds ?? []);
  }
}
