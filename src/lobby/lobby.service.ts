import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GametablePlayerEntity } from './entities/gametable-player.entity';
import { TournamentSubscriptionEntity } from './entities/tournament-subscription.entity';
import { CgTableDto } from './dto/cg-table.dto';
import { SngTableDto } from './dto/sng-table.dto';
import { TournamentDto } from './dto/tournament.dto';
import { PlayerStackDto } from './dto/player-stack.dto';

@Injectable()
export class LobbyService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GametablePlayerEntity)
    private readonly gametablePlayerRepo: Repository<GametablePlayerEntity>,
    @InjectRepository(TournamentSubscriptionEntity)
    private readonly tournamentSubRepo: Repository<TournamentSubscriptionEntity>,
  ) {}

  // ── Cash Game Tables ──────────────────────────────────────────────────────

  getCGTables(): Promise<CgTableDto[]> {
    return this.dataSource.query<CgTableDto[]>(`
      SELECT
        gt.gametableid   AS tableId,
        COALESCE(NULLIF(gt.label, ''), gta.label) AS label,
        gt.playerscount  AS nbPlayers,
        gt.gamestate     AS gameState,
        gta.gametype     AS gameType,
        gta.limittype    AS limitType,
        gta.moneytype    AS moneyType,
        gta.hasvideo     AS hasVideo,
        gta.minplayers   AS minPlayers,
        gta.maxplayers   AS maxPlayers,
        bv.smallblind    AS smallBlind,
        bv.bigblind      AS bigBlind
      FROM gametable gt
      JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
      JOIN blindlevel         bl  ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues        bv  ON bv.blindvaluesid    = bl.blindvaluesid
      WHERE gt.tabletype       = 0
        AND gt.ownerplayerid   IS NULL
      ORDER BY gt.playerscount DESC
    `);
  }

  getPrivateCGTables(playerId: number): Promise<CgTableDto[]> {
    return this.dataSource.query<CgTableDto[]>(`
      SELECT
        gt.gametableid   AS tableId,
        COALESCE(NULLIF(gt.label, ''), gta.label) AS label,
        gt.playerscount  AS nbPlayers,
        gt.gamestate     AS gameState,
        gta.gametype     AS gameType,
        gta.limittype    AS limitType,
        gta.moneytype    AS moneyType,
        gta.hasvideo     AS hasVideo,
        gta.minplayers   AS minPlayers,
        gta.maxplayers   AS maxPlayers,
        bv.smallblind    AS smallBlind,
        bv.bigblind      AS bigBlind
      FROM gametable gt
      JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
      JOIN blindlevel         bl  ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues        bv  ON bv.blindvaluesid    = bl.blindvaluesid
      JOIN gametableplayer    gtp ON gtp.gametableid = gt.gametableid
                                 AND gtp.playerid    = ?
                                 AND gtp.endts       = 0
      WHERE gt.tabletype     = 0
        AND gt.ownerplayerid IS NOT NULL
      ORDER BY gt.playerscount DESC
    `, [playerId]);
  }

  getOwnerPrivateCGTables(ownerId: number): Promise<CgTableDto[]> {
    return this.dataSource.query<CgTableDto[]>(`
      SELECT
        gt.gametableid   AS tableId,
        COALESCE(NULLIF(gt.label, ''), gta.label) AS label,
        gt.playerscount  AS nbPlayers,
        gt.gamestate     AS gameState,
        gta.gametype     AS gameType,
        gta.limittype    AS limitType,
        gta.moneytype    AS moneyType,
        gta.hasvideo     AS hasVideo,
        gta.minplayers   AS minPlayers,
        gta.maxplayers   AS maxPlayers,
        bv.smallblind    AS smallBlind,
        bv.bigblind      AS bigBlind
      FROM gametable gt
      JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
      JOIN blindlevel         bl  ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues        bv  ON bv.blindvaluesid    = bl.blindvaluesid
      WHERE gt.tabletype     = 0
        AND gt.ownerplayerid = ?
      ORDER BY gt.playerscount DESC
    `, [ownerId]);
  }

  // ── SNG Tables ────────────────────────────────────────────────────────────

  getSNGTables(): Promise<SngTableDto[]> {
    return this.dataSource.query<SngTableDto[]>(`
      SELECT
        gt.gametableid   AS tableOrTournId,
        COALESCE(NULLIF(gt.label, ''), gta.label) AS label,
        gt.playerscount  AS nbPlayers,
        gt.gamestate     AS gameState,
        gta.gametype     AS gameType,
        gta.limittype    AS limitType,
        gta.moneytype    AS moneyType,
        gta.hasvideo     AS hasVideo,
        gta.minplayers   AS minPlayers,
        gta.maxplayers   AS maxPlayers,
        gta.buyin        AS buyIn,
        0                AS subscriptionState,
        0                AS subscriptionType,
        0                AS structureType
      FROM gametable gt
      JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
      WHERE gt.tabletype = 1
      ORDER BY gt.playerscount DESC
    `);
  }

  // ── Tournaments ───────────────────────────────────────────────────────────

  getTournaments(): Promise<TournamentDto[]> {
    return this.dataSource.query<TournamentDto[]>(`
      SELECT
        t.tournamentid          AS tournamentId,
        t.label                 AS label,
        t.gamestate             AS gameState,
        t.subscriptionstate     AS subscriptionState,
        t.playerscount          AS playersCount,
        t.ingameplayerscount    AS inGamePlayersCount,
        UNIX_TIMESTAMP(t.starttime) AS startTime,
        ta.buyin                AS buyIn,
        ta.gametype             AS gameType,
        ta.limittype            AS limitType,
        ta.moneytype            AS moneyType,
        ta.hasvideo             AS hasVideo,
        ta.minplayers           AS minPlayers,
        ta.maxplayers           AS maxPlayers,
        ta.tablesize            AS tableSize,
        ta.structuretype        AS structureType,
        ta.addonbreakindex      AS addonBreakIndex,
        0                       AS prizepool,
        0                       AS guaranteedPrizePool,
        NULL                    AS startOffset
      FROM tournament t
      JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      WHERE t.gamestate IN (0, 1)
      ORDER BY t.starttime ASC
    `);
  }

  getPrivateTournaments(playerId: number): Promise<TournamentDto[]> {
    return this.dataSource.query<TournamentDto[]>(`
      SELECT
        t.tournamentid          AS tournamentId,
        t.label                 AS label,
        t.gamestate             AS gameState,
        t.subscriptionstate     AS subscriptionState,
        t.playerscount          AS playersCount,
        t.ingameplayerscount    AS inGamePlayersCount,
        UNIX_TIMESTAMP(t.starttime) AS startTime,
        ta.buyin                AS buyIn,
        ta.gametype             AS gameType,
        ta.limittype            AS limitType,
        ta.moneytype            AS moneyType,
        ta.hasvideo             AS hasVideo,
        ta.minplayers           AS minPlayers,
        ta.maxplayers           AS maxPlayers,
        ta.tablesize            AS tableSize,
        ta.structuretype        AS structureType,
        ta.addonbreakindex      AS addonBreakIndex,
        0                       AS prizepool,
        0                       AS guaranteedPrizePool,
        NULL                    AS startOffset
      FROM tournament t
      JOIN tournamentarchetype      ta  ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      JOIN tournamentsubscription   ts  ON ts.tournamentid = t.tournamentid
                                       AND ts.playerid     = ?
                                       AND ts.subscription = 0
      WHERE t.gamestate IN (0, 1)
      ORDER BY t.starttime ASC
    `, [playerId]);
  }

  getOwnerPrivateTournaments(ownerId: number): Promise<TournamentDto[]> {
    // Tournois privés via invitation campoke envoyée par cet owner
    return this.dataSource.query<TournamentDto[]>(`
      SELECT DISTINCT
        t.tournamentid          AS tournamentId,
        t.label                 AS label,
        t.gamestate             AS gameState,
        t.subscriptionstate     AS subscriptionState,
        t.playerscount          AS playersCount,
        t.ingameplayerscount    AS inGamePlayersCount,
        UNIX_TIMESTAMP(t.starttime) AS startTime,
        ta.buyin                AS buyIn,
        ta.gametype             AS gameType,
        ta.limittype            AS limitType,
        ta.moneytype            AS moneyType,
        ta.hasvideo             AS hasVideo,
        ta.minplayers           AS minPlayers,
        ta.maxplayers           AS maxPlayers,
        ta.tablesize            AS tableSize,
        ta.structuretype        AS structureType,
        ta.addonbreakindex      AS addonBreakIndex,
        0                       AS prizepool,
        0                       AS guaranteedPrizePool,
        NULL                    AS startOffset
      FROM tournament t
      JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      JOIN campoke              c  ON c.tournamentid = t.tournamentid
                                  AND c.playeridfrom = ?
      WHERE t.gamestate IN (0, 1)
      ORDER BY t.starttime ASC
    `, [ownerId]);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  getTablePlayers(tableId: number): Promise<PlayerStackDto[]> {
    return this.dataSource.query<PlayerStackDto[]>(`
      SELECT
        gtp.rank                                       AS rank,
        gtp.stack                                      AS stack,
        CONCAT(pi.firstname, ' ', pi.lastname)         AS screenName
      FROM gametableplayer gtp
      JOIN playerinfos pi ON pi.playerid = gtp.playerid
      WHERE gtp.gametableid = ?
        AND gtp.endts       = 0
      ORDER BY gtp.rank ASC, gtp.stack DESC
    `, [tableId]);
  }

  getTournamentPlayers(tourId: number): Promise<PlayerStackDto[]> {
    return this.dataSource.query<PlayerStackDto[]>(`
      SELECT
        gtp.rank                                       AS rank,
        gtp.stack                                      AS stack,
        CONCAT(pi.firstname, ' ', pi.lastname)         AS screenName
      FROM gametableplayer gtp
      JOIN gametable   gt ON gt.gametableid = gtp.gametableid
                          AND gt.tournamentid = ?
      JOIN playerinfos pi ON pi.playerid    = gtp.playerid
      WHERE gtp.endts = 0
      ORDER BY gtp.rank ASC, gtp.stack DESC
    `, [tourId]);
  }
}
