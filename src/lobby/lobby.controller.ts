import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LobbyService } from './lobby.service';
import { CgTableDto } from './dto/cg-table.dto';
import { SngTableDto } from './dto/sng-table.dto';
import { TournamentDto } from './dto/tournament.dto';
import { PlayerStackDto } from './dto/player-stack.dto';
import { SubscribableArchetypeDto } from './dto/subscribable-archetype.dto';

@Controller('lobby')
export class LobbyController {
  constructor(private readonly lobby: LobbyService) {}

  // ── Cash Game Tables ──────────────────────────────────────────────────────

  @ApiTags('Cash Game Tables')
  @ApiOperation({ summary: 'Toutes les tables de cash game publiques (ownerplayerid IS NULL)' })
  @ApiResponse({ status: 200, type: [CgTableDto] })
  @Get('cg-tables')
  getCGTables() {
    return this.lobby.getCGTables();
  }

  @ApiTags('Cash Game Tables')
  @ApiOperation({ summary: 'Tables privées auxquelles le joueur est actuellement assis' })
  @ApiParam({ name: 'playerId', type: Number, example: 123, description: 'player.playerid' })
  @ApiResponse({ status: 200, type: [CgTableDto] })
  @Get('cg-tables/private/:playerId')
  getPrivateCGTables(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.lobby.getPrivateCGTables(playerId);
  }

  @ApiTags('Cash Game Tables')
  @ApiOperation({ summary: 'Tables privées créées par cet owner (gametable.ownerplayerid)' })
  @ApiParam({ name: 'ownerId', type: Number, example: 456, description: 'player.playerid du owner' })
  @ApiResponse({ status: 200, type: [CgTableDto] })
  @Get('cg-tables/owned/:ownerId')
  getOwnerPrivateCGTables(@Param('ownerId', ParseIntPipe) ownerId: number) {
    return this.lobby.getOwnerPrivateCGTables(ownerId);
  }

  // ── SNG Tables ────────────────────────────────────────────────────────────

  @ApiTags('SNG Tables')
  @ApiOperation({ summary: 'Toutes les tables Sit-N-Go (gametable.tabletype = 1)' })
  @ApiResponse({ status: 200, type: [SngTableDto] })
  @Get('sng-tables')
  getSNGTables() {
    return this.lobby.getSNGTables();
  }

  @ApiTags('SNG Tables')
  @ApiOperation({ summary: 'Archetypes non-classic auxquels s\'inscrire (CamDate/mixedGendersSNG, publicCG...)' })
  @ApiResponse({ status: 200, type: [SubscribableArchetypeDto] })
  @Get('subscribable-archetypes')
  getSubscribableArchetypes() {
    return this.lobby.getSubscribableArchetypes();
  }

  @ApiTags('SNG Tables')
  @ApiOperation({ summary: 'Archetypes non-classic pour un client spécifique (clientid = clientId)' })
  @ApiParam({ name: 'clientId', type: Number, example: 1 })
  @ApiResponse({ status: 200, type: [SubscribableArchetypeDto] })
  @Get('subscribable-archetypes/:clientId')
  getSubscribableArchetypesByClient(@Param('clientId', ParseIntPipe) clientId: number) {
    return this.lobby.getSubscribableArchetypes(clientId);
  }

  // ── Tournaments ───────────────────────────────────────────────────────────

  @ApiTags('Tournaments')
  @ApiOperation({ summary: 'Tous les tournois actifs (gamestate IN 0,1)' })
  @ApiResponse({ status: 200, type: [TournamentDto] })
  @Get('tournaments')
  getTournaments() {
    return this.lobby.getTournaments();
  }

  @ApiTags('Tournaments')
  @ApiOperation({ summary: 'Tournois du club du joueur (JOIN clubplayer) — PAS les inscriptions' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [TournamentDto] })
  @Get('tournaments/private/:playerId')
  getPrivateTournaments(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.lobby.getPrivateTournaments(playerId);
  }

  @ApiTags('Tournaments')
  @ApiOperation({ summary: 'Tournois auxquels le joueur est INSCRIT (tournamentsubscription.subscription = 0)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [TournamentDto] })
  @Get('tournaments/subscribed/:playerId')
  getSubscribedTournaments(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.lobby.getSubscribedTournaments(playerId);
  }

  @ApiTags('Tournaments')
  @ApiOperation({ summary: 'Tournois créés via campoke par cet owner' })
  @ApiParam({ name: 'ownerId', type: Number, example: 456 })
  @ApiResponse({ status: 200, type: [TournamentDto] })
  @Get('tournaments/owned/:ownerId')
  getOwnerPrivateTournaments(@Param('ownerId', ParseIntPipe) ownerId: number) {
    return this.lobby.getOwnerPrivateTournaments(ownerId);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  @ApiTags('Players')
  @ApiOperation({ summary: 'Joueurs assis sur une table (gametableplayer.endts = 0)' })
  @ApiParam({ name: 'tableId', type: Number, example: 12, description: 'gametable.gametableid' })
  @ApiResponse({ status: 200, type: [PlayerStackDto] })
  @Get('tables/:tableId/players')
  getTablePlayers(@Param('tableId', ParseIntPipe) tableId: number) {
    return this.lobby.getTablePlayers(tableId);
  }

  @ApiTags('Players')
  @ApiOperation({ summary: 'Tous les joueurs en jeu dans un tournoi (toutes les tables)' })
  @ApiParam({ name: 'tourId', type: Number, example: 55, description: 'tournament.tournamentid' })
  @ApiResponse({ status: 200, type: [PlayerStackDto] })
  @Get('tournaments/:tourId/players')
  getTournamentPlayers(@Param('tourId', ParseIntPipe) tourId: number) {
    return this.lobby.getTournamentPlayers(tourId);
  }
}
