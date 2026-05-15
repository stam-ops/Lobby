import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClubService } from './club.service';
import {
  GiftDto, VipItemDto, ClubDto, ClubPlayerInfoDto,
  ClubTournamentPlayerDto, ClubTournamentOfferDto, ThemeDto, VIPPromoDto,
} from './dto/club.dto';
import { TournamentDto } from '../lobby/dto/tournament.dto';

@ApiTags('Club')
@Controller('club')
export class ClubController {
  constructor(private readonly club: ClubService) {}

  @ApiOperation({ summary: 'Liste des cadeaux disponibles (Club.java → getPresentPrize)' })
  @ApiResponse({ status: 200, type: [GiftDto] })
  @Get('prizes')
  getPresentPrizes() {
    return this.club.getPresentPrizes();
  }

  @ApiOperation({ summary: 'Offres VIP disponibles (Club.java → getVIPItem)' })
  @ApiResponse({ status: 200, type: [VipItemDto] })
  @Get('vip-items')
  getVipItems() {
    return this.club.getVipItems();
  }

  @ApiOperation({ summary: 'Offres de tournois club (Club.java → getClubTournamentPrize)' })
  @ApiResponse({ status: 200, type: [ClubTournamentOfferDto] })
  @Get('tournament-offers')
  getClubTournamentPrize() {
    return this.club.getClubTournamentPrize();
  }

  @ApiOperation({ summary: 'Thèmes disponibles (Club.java → getThemes)' })
  @ApiResponse({ status: 200, type: [ThemeDto] })
  @Get('themes')
  getThemes() {
    return this.club.getThemes();
  }

  @ApiOperation({ summary: 'Promotions VIP actives (Club.java → getVIPPromo)' })
  @ApiResponse({ status: 200, type: [VIPPromoDto] })
  @Get('vip-promo')
  getVIPCost1Month() {
    return this.club.getVIPCost1Month();
  }

  @ApiOperation({ summary: 'Clubs d\'un joueur (Club.java → getClub)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'onlyAdmin', required: false, type: Boolean, example: false })
  @ApiResponse({ status: 200, type: [ClubDto] })
  @Get('player/:playerId')
  getClub(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('onlyAdmin') onlyAdmin?: string,
  ) {
    return this.club.getClub(playerId, onlyAdmin === 'true');
  }

  @ApiOperation({ summary: 'Joueurs d\'un club avec scores (Club.java → getClubPlayer)' })
  @ApiParam({ name: 'clubId', type: Number, example: 10 })
  @ApiQuery({ name: 'playerIdFrom', required: true, type: Number, example: 123, description: 'Joueur faisant la requête (pour isFriend)' })
  @ApiQuery({ name: 'admin', required: false, type: Boolean, example: false, description: 'true = inclure tous états joueurs' })
  @ApiResponse({ status: 200, type: [ClubPlayerInfoDto] })
  @Get(':clubId/players')
  getClubPlayer(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query('playerIdFrom', ParseIntPipe) playerIdFrom: number,
    @Query('admin') admin?: string,
  ) {
    return this.club.getClubPlayer(playerIdFrom, clubId, admin === 'true');
  }

  @ApiOperation({ summary: 'Tournois publics + club d\'un joueur (Tournament.java → getTournamentsWithClub)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [TournamentDto] })
  @Get('player/:playerId/tournaments')
  getTournamentsWithClub(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.club.getTournamentsWithClub(playerId);
  }

  @ApiOperation({ summary: 'Tournois d\'un club (Tournament.java → getClubTournaments)' })
  @ApiParam({ name: 'clubId', type: Number, example: 10 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, type: [TournamentDto] })
  @Get(':clubId/tournaments')
  getClubTournaments(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 20,
  ) {
    return this.club.getClubTournaments(clubId, max);
  }

  @ApiOperation({ summary: 'Joueurs d\'un tournoi club (Club.java → getClubTournamentPlayer)' })
  @ApiParam({ name: 'tournamentId', type: Number, example: 55 })
  @ApiQuery({ name: 'playerIdFrom', required: true, type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [ClubTournamentPlayerDto] })
  @Get('tournaments/:tournamentId/players')
  getClubTournamentPlayer(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Query('playerIdFrom', ParseIntPipe) playerIdFrom: number,
  ) {
    return this.club.getClubTournamentPlayer(playerIdFrom, tournamentId);
  }

  @ApiOperation({ summary: 'Amis directs (réseau) d\'un joueur (Social.java → getNetworkFriends)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, type: [ClubPlayerInfoDto] })
  @Get('player/:playerId/network-friends')
  getNetworkFriends(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 50,
  ) {
    return this.club.getNetworkFriends(playerId, max);
  }

  @ApiOperation({ summary: 'Membres d\'un club avec statut ami (Club.java → getNetworkClub)' })
  @ApiParam({ name: 'clubId', type: Number, example: 10 })
  @ApiQuery({ name: 'playerIdFrom', required: true, type: Number, example: 123 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, type: [ClubPlayerInfoDto] })
  @Get(':clubId/network')
  getNetworkClub(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query('playerIdFrom', ParseIntPipe) playerIdFrom: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 50,
  ) {
    return this.club.getNetworkClub(playerIdFrom, clubId, max);
  }
}
