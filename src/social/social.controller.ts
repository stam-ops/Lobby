import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SocialService } from './social.service';
import { NotificationDto } from './dto/notification.dto';
import { PlayerInfoDto, FriendDto, TournamentResultDto, PlayerStatsDto } from './dto/player-info.dto';

@ApiTags('Social')
@Controller('social')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @ApiOperation({ summary: 'Notifications d\'un joueur (Social.java → getPlayerNotifications)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 20, description: 'Nb max de notifs optionnelles' })
  @ApiResponse({ status: 200, type: [NotificationDto] })
  @Get('notifications/:playerId')
  getPlayerNotifications(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 20,
  ) {
    return this.social.getPlayerNotifications(playerId, max);
  }

  @ApiOperation({ summary: 'Recherche joueurs par screenname (Social.java → getPlayerInfos)' })
  @ApiParam({ name: 'playerIdFrom', type: Number, example: 123, description: 'Joueur qui effectue la recherche (pour isFriend)' })
  @ApiQuery({ name: 'q', required: true, type: String, example: 'john', description: 'Début du screenname (LIKE %q%)' })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, type: [PlayerInfoDto] })
  @Get('players/:playerIdFrom/search')
  getPlayerInfos(
    @Param('playerIdFrom', ParseIntPipe) playerIdFrom: number,
    @Query('q') q: string,
    @Query('max', new ParseIntPipe({ optional: true })) max = 20,
  ) {
    return this.social.getPlayerInfos(playerIdFrom, q ?? '', max);
  }

  @ApiOperation({ summary: 'Amis d\'un joueur (bidirectionnel) (Social.java → getFriends)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, type: [FriendDto] })
  @Get('friends/:playerId')
  getFriends(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 50,
  ) {
    return this.social.getFriends(playerId, max);
  }

  @ApiOperation({ summary: 'Demandes d\'amis reçues, en attente de réponse (friendrelationstate=2, je suis la cible)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [FriendDto] })
  @Get('friend-requests/incoming/:playerId')
  getIncomingFriendRequests(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.social.getIncomingFriendRequests(playerId);
  }

  @ApiOperation({ summary: 'Demandes d\'amis envoyées, en attente de réponse (friendrelationstate=2, je suis l\'émetteur)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [FriendDto] })
  @Get('friend-requests/outgoing/:playerId')
  getOutgoingFriendRequests(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.social.getOutgoingFriendRequests(playerId);
  }

  @ApiOperation({ summary: 'Amis sponsorisés (Social.java → getSponsoredFriends)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, type: [FriendDto] })
  @Get('sponsored-friends/:playerId')
  getSponsoredFriends(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 50,
  ) {
    return this.social.getSponsoredFriends(playerId, max);
  }

  @ApiOperation({ summary: 'Derniers résultats en tournoi (Social.java → getPlayerTournamentLastResults)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'max', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, type: [TournamentResultDto] })
  @Get('tournament-results/:playerId')
  getPlayerTournamentLastResults(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('max', new ParseIntPipe({ optional: true })) max = 10,
  ) {
    return this.social.getPlayerTournamentLastResults(playerId, max);
  }

  @ApiOperation({ summary: 'Statistiques d\'un joueur (Social.java → getPlayerStats)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: PlayerStatsDto })
  @Get('stats/:playerId')
  getPlayerStats(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.social.getPlayerStats(playerId);
  }
}
