import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RankingService } from './ranking.service';
import { RankEntryDto, PlayerRankRowDto, PlayerRankingDto, DailyResultDto } from './dto/rank-entry.dto';

@ApiTags('Ranking')
@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @ApiOperation({ summary: 'Résultats du tournoi quotidien numéro N (Challenges.java → getResultsDaily)' })
  @ApiParam({ name: 'number', type: Number, example: 1, description: '1–10 selon l\'heure du tournoi' })
  @ApiResponse({ status: 200, type: [DailyResultDto] })
  @Get('daily/:number')
  getResultsDaily(@Param('number', ParseIntPipe) number: number) {
    return this.ranking.getResultsDaily(number);
  }

  @ApiOperation({ summary: 'Top N vainqueurs de tournois (Challenges.java → getTopWinTournamentWithPeriod)' })
  @ApiParam({ name: 'number', type: Number, example: 10 })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 0, description: '0=all, 1=mois, 2=mois préc, 3=semaine, 4=sem préc' })
  @ApiResponse({ status: 200, type: [RankEntryDto] })
  @Get('top-tournament/:number')
  getTopWinTournamentWithPeriod(
    @Param('number', ParseIntPipe) number: number,
    @Query('period', new ParseIntPipe({ optional: true })) period = 0,
  ) {
    return this.ranking.getTopWinTournamentWithPeriod(number, period);
  }

  @ApiOperation({ summary: 'Classement gains en tournoi (Challenges.java → getRankTournamentWithPeriod)' })
  @ApiParam({ name: 'number', type: Number, example: 10 })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, type: [RankEntryDto] })
  @Get('tournament/:number')
  getRankTournamentWithPeriod(
    @Param('number', ParseIntPipe) number: number,
    @Query('period', new ParseIntPipe({ optional: true })) period = 0,
  ) {
    return this.ranking.getRankTournamentWithPeriod(number, period);
  }

  @ApiOperation({ summary: 'Classement gains en SNG (Challenges.java → getRankSNGWithPeriod)' })
  @ApiParam({ name: 'number', type: Number, example: 10 })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, type: [RankEntryDto] })
  @Get('sng/:number')
  getRankSNGWithPeriod(
    @Param('number', ParseIntPipe) number: number,
    @Query('period', new ParseIntPipe({ optional: true })) period = 0,
  ) {
    return this.ranking.getRankSNGWithPeriod(number, period);
  }

  @ApiOperation({ summary: 'Classement profit cash game (Challenges.java → getRankCashGameWithPeriod)' })
  @ApiParam({ name: 'number', type: Number, example: 10 })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, type: [RankEntryDto] })
  @Get('cash/:number')
  getRankCashGameWithPeriod(
    @Param('number', ParseIntPipe) number: number,
    @Query('period', new ParseIntPipe({ optional: true })) period = 0,
  ) {
    return this.ranking.getRankCashGameWithPeriod(number, period);
  }

  @ApiOperation({ summary: 'Classement global (cash + tournoi + SNG) (Challenges.java → getRankAllWithPeriod)' })
  @ApiParam({ name: 'number', type: Number, example: 10 })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, type: [RankEntryDto] })
  @Get('all/:number')
  getRankAllWithPeriod(
    @Param('number', ParseIntPipe) number: number,
    @Query('period', new ParseIntPipe({ optional: true })) period = 0,
  ) {
    return this.ranking.getRankAllWithPeriod(number, period);
  }

  @ApiOperation({ summary: 'Classement autour d\'un joueur (PlayerAccount.java → getPlayerRanking)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiQuery({ name: 'nBefore', required: false, type: Number, example: 5, description: 'Nb joueurs mieux classés' })
  @ApiQuery({ name: 'nAfter', required: false, type: Number, example: 5, description: 'Nb joueurs moins bien classés' })
  @ApiResponse({ status: 200, type: PlayerRankingDto })
  @Get('player/:playerId')
  getPlayerRanking(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('nBefore', new ParseIntPipe({ optional: true })) nBefore = 5,
    @Query('nAfter', new ParseIntPipe({ optional: true })) nAfter = 5,
  ) {
    return this.ranking.getPlayerRanking(playerId, nBefore, nAfter);
  }

  @ApiOperation({ summary: 'Top N joueurs tous scores confondus (PlayerAccount.java → getRankedPlayersTop)' })
  @ApiParam({ name: 'number', type: Number, example: 10 })
  @ApiResponse({ status: 200, type: [PlayerRankRowDto] })
  @Get('top/:number')
  getPlayerTop(@Param('number', ParseIntPipe) number: number) {
    return this.ranking.getPlayerTop(number);
  }

  @ApiOperation({ summary: 'Classement parmi les amis (le joueur + ses amis, triés par score)' })
  @ApiParam({ name: 'playerId', type: Number, example: 123 })
  @ApiResponse({ status: 200, type: [PlayerRankRowDto] })
  @Get('friends/:playerId')
  getFriendsRanking(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.ranking.getFriendsRanking(playerId);
  }
}
