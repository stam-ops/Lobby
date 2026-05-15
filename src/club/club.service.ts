import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  GiftDto, VipItemDto, ClubDto, ClubPlayerInfoDto,
  ClubTournamentInfoDto, ClubTournamentPlayerDto,
  ClubTournamentOfferDto, ThemeDto, VIPPromoDto,
} from './dto/club.dto';
import { TournamentDto } from '../lobby/dto/tournament.dto';

@Injectable()
export class ClubService {
  constructor(private readonly dataSource: DataSource) {}

  // Source: Club.java → getPresentPrize()
  getPresentPrizes(): Promise<GiftDto[]> {
    return this.dataSource.query<GiftDto[]>(`
      SELECT giftid AS giftId, prize FROM gift
    `);
  }

  // Source: Club.java → getVIPItem()
  getVipItems(): Promise<VipItemDto[]> {
    return this.dataSource.query<VipItemDto[]>(`
      SELECT vipofferid AS vipOfferId, prize, nbdays AS nbDays
      FROM vipoffer WHERE deactivated = 0
    `);
  }

  // Source: Club.java → getClubTournamentPrize()
  getClubTournamentPrize(): Promise<ClubTournamentOfferDto[]> {
    return this.dataSource.query<ClubTournamentOfferDto[]>(`
      SELECT leveltime AS levelTime, initialstack AS initialStack, creditperplayer AS creditPerPlayer
      FROM clubtournamentoffer
    `);
  }

  // Source: Club.java → getThemes()
  getThemes(): Promise<ThemeDto[]> {
    return this.dataSource.query<ThemeDto[]>(`
      SELECT themename AS themeName FROM theme
    `);
  }

  // Source: Club.java → getVIPPromo()
  getVIPCost1Month(): Promise<VIPPromoDto[]> {
    return this.dataSource.query<VIPPromoDto[]>(`
      SELECT UNIX_TIMESTAMP(endts) AS endTs, paypalcode AS paypalCode, prize
      FROM promovip
      WHERE CURDATE() >= startts AND CURDATE() < endts
    `);
  }

  // Source: Club.java → getClub(playerId, onlyAdmin)
  getClub(playerId: number, onlyAdmin: boolean): Promise<ClubDto[]> {
    const adminFilter = onlyAdmin ? `AND (cp.clubplayerstate = 1 OR cp.clubplayerstate = 2)` : '';
    return this.dataSource.query<ClubDto[]>(`
      SELECT c.clubname AS clubName, c.clubid AS clubId, c.clubcode AS clubCode,
             c.credits, cp.clubplayerstate AS clubPlayerState
      FROM clubplayer cp
      JOIN club c ON c.clubid = cp.clubid
      WHERE cp.playerid = ?
        ${adminFilter}
    `, [playerId]);
  }

  // Source: Club.java → getClubPlayer(playerIdFrom, clubId, admin)
  async getClubPlayer(playerIdFrom: number, clubId: number, admin: boolean): Promise<ClubPlayerInfoDto[]> {
    const adminFilter = admin ? '' : `AND cp.clubplayerstate IN (0, 1, 2)`;

    // Requête principale avec scores
    let rows = await this.dataSource.query<any[]>(`
      SELECT
        sum(wp.amount)      AS score,
        cp.clubplayerstate  AS clubState,
        p.accounttype       AS accountType,
        pi.playerid         AS playerId,
        pi.screenname       AS screenName,
        pi.firstname        AS firstName,
        pi.lastname         AS lastName,
        pi.fbuid            AS fbUid
      FROM clubplayer cp
      JOIN playerinfos            pi  ON pi.playerid                  = cp.playerid
      JOIN player                 p   ON p.playerid                   = cp.playerid
      JOIN tournamentsubscription ts  ON ts.playerid                  = pi.playerid
      JOIN genericsubscription    gs  ON gs.tournamentsubscriptionid  = ts.tournamentsubscriptionid
      JOIN wonprize               wp  ON wp.genericsubscriptionid     = gs.genericsubscriptionid
      JOIN tournament             tr  ON tr.tournamentid              = ts.tournamentid
      JOIN tournamentarchetype    tar ON tar.tournamentarchetypeid     = tr.tournamentarchetypeid
      WHERE cp.clubid = ?
        AND tar.clubid = ?
        ${adminFilter}
      GROUP BY pi.playerid
      ORDER BY score DESC
    `, [clubId, clubId]);

    // Fallback si aucun résultat (pas encore de tournois joués)
    if (!rows.length) {
      rows = await this.dataSource.query<any[]>(`
        SELECT
          NULL               AS score,
          cp.clubplayerstate AS clubState,
          p.accounttype      AS accountType,
          pi.playerid        AS playerId,
          pi.screenname      AS screenName,
          pi.firstname       AS firstName,
          pi.lastname        AS lastName,
          pi.fbuid           AS fbUid
        FROM clubplayer cp
        JOIN playerinfos pi ON pi.playerid = cp.playerid
        JOIN player      p  ON p.playerid  = cp.playerid
        WHERE cp.clubid = ?
          ${adminFilter}
      `, [clubId]);
    }

    // Résolution des amis
    const playerIds = rows.map(r => r.playerId);
    const friendIds = new Set<number>();

    if (playerIdFrom > 0 && playerIds.length > 0) {
      const ph = playerIds.map(() => '?').join(',');
      const friends = await this.dataSource.query<{ playerid: number }[]>(`
        SELECT playeridto AS playerid FROM friendrelation
        WHERE playeridfrom = ? AND playeridto IN (${ph})
        UNION
        SELECT playeridfrom AS playerid FROM friendrelation
        WHERE playeridto = ? AND playeridfrom IN (${ph})
      `, [playerIdFrom, ...playerIds, playerIdFrom, ...playerIds]);
      friends.forEach(f => friendIds.add(f.playerid));
    }

    return rows.map(r => ({
      ...r,
      isFriend: friendIds.has(r.playerId),
    }));
  }

  // Source: Tournament.java → getTournamentsWithClub(playerId)
  async getTournamentsWithClub(playerId: number): Promise<TournamentDto[]> {
    const [clubTournaments, publicTournaments] = await Promise.all([
      this.dataSource.query<TournamentDto[]>(`
        SELECT
          t.tournamentid                          AS tournamentId,
          t.label                                 AS label,
          ta.maxplayers                           AS maxPlayers,
          ta.minplayers                           AS minPlayers,
          t.playerscount                          AS playersCount,
          t.ingameplayerscount                    AS inGamePlayersCount,
          ta.gametype                             AS gameType,
          ta.limittype                            AS limitType,
          ta.buyin                                AS buyIn,
          t.gamestate                             AS gameState,
          t.subscriptionstate                     AS subscriptionState,
          UNIX_TIMESTAMP(t.starttime)             AS startTime,
          ta.timeforsubscriptionsbeforestart      AS timeForSubscriptionsBeforeStart,
          ta.moneytype                            AS moneyType,
          ta.hasvideo                             AS hasVideo,
          ta.tablesize                            AS tableSize,
          ta.structuretype                        AS structureType,
          ta.addonbreakindex                      AS addonBreakIndex,
          ta.lastlateregisterlevel                AS lastLateRegisterLevel
        FROM tournament t
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
        JOIN clubplayer          cp ON cp.clubid = ta.clubid AND cp.playerid = ?
        WHERE ta.starttype = 0
          AND t.gamestate IN (0, 1, 2, 3)
        ORDER BY t.starttime ASC, ta.periodtype ASC
      `, [playerId]),
      this.dataSource.query<TournamentDto[]>(`
        SELECT
          t.tournamentid                          AS tournamentId,
          t.label                                 AS label,
          ta.maxplayers                           AS maxPlayers,
          ta.minplayers                           AS minPlayers,
          t.playerscount                          AS playersCount,
          t.ingameplayerscount                    AS inGamePlayersCount,
          ta.gametype                             AS gameType,
          ta.limittype                            AS limitType,
          ta.buyin                                AS buyIn,
          t.gamestate                             AS gameState,
          t.subscriptionstate                     AS subscriptionState,
          UNIX_TIMESTAMP(t.starttime)             AS startTime,
          ta.timeforsubscriptionsbeforestart      AS timeForSubscriptionsBeforeStart,
          ta.moneytype                            AS moneyType,
          ta.hasvideo                             AS hasVideo,
          ta.tablesize                            AS tableSize,
          ta.structuretype                        AS structureType,
          ta.addonbreakindex                      AS addonBreakIndex,
          ta.lastlateregisterlevel                AS lastLateRegisterLevel
        FROM tournament t
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
        WHERE ta.starttype = 0
          AND t.gamestate IN (0, 1, 2, 3)
          AND ta.clubid IS NULL
        ORDER BY t.starttime ASC, ta.periodtype ASC
      `),
    ]);

    return [...clubTournaments, ...publicTournaments];
  }

  // Source: Tournament.java → getClubTournaments(clubId, max)
  getClubTournaments(clubId: number, max: number): Promise<TournamentDto[]> {
    return this.dataSource.query<TournamentDto[]>(`
      SELECT
        t.tournamentid                          AS tournamentId,
        t.label                                 AS label,
        ta.maxplayers                           AS maxPlayers,
        ta.minplayers                           AS minPlayers,
        t.playerscount                          AS playersCount,
        t.ingameplayerscount                    AS inGamePlayersCount,
        ta.gametype                             AS gameType,
        ta.limittype                            AS limitType,
        ta.buyin                                AS buyIn,
        t.gamestate                             AS gameState,
        t.subscriptionstate                     AS subscriptionState,
        UNIX_TIMESTAMP(t.starttime)             AS startTime,
        ta.timeforsubscriptionsbeforestart      AS timeForSubscriptionsBeforeStart,
        ta.moneytype                            AS moneyType,
        ta.hasvideo                             AS hasVideo,
        ta.tablesize                            AS tableSize,
        ta.structuretype                        AS structureType,
        ta.addonbreakindex                      AS addonBreakIndex,
        ta.lastlateregisterlevel                AS lastLateRegisterLevel
      FROM tournament t
      JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      WHERE ta.clubid = ?
      ORDER BY t.starttime ASC
      LIMIT ?
    `, [clubId, max]);
  }

  // Source: Club.java → getClubTournamentPlayer(playerIdFrom, tournamentId)
  async getClubTournamentPlayer(playerIdFrom: number, tournamentId: number): Promise<ClubTournamentPlayerDto[]> {
    const statusRows = await this.dataSource.query<{ gamestate: number }[]>(
      `SELECT gamestate FROM tournament WHERE tournamentid = ? LIMIT 1`, [tournamentId]);

    const ended = statusRows.length > 0 && statusRows[0].gamestate === 4;

    const rows = ended
      ? await this.dataSource.query<any[]>(`
          SELECT
            wp.amount                   AS score,
            pi.playerid                 AS playerId,
            pi.screenname               AS screenName,
            pi.fbuid                    AS fbUid,
            pi.firstname                AS firstName,
            pi.lastname                 AS lastName,
            p.accounttype               AS accountType,
            cp.clubplayerstate          AS clubPlayerState
          FROM tournamentsubscription ts
          JOIN playerinfos         pi  ON pi.playerid                  = ts.playerid
          JOIN tournament          tr  ON tr.tournamentid              = ts.tournamentid
          JOIN tournamentarchetype tar ON tar.tournamentarchetypeid     = tr.tournamentarchetypeid
          JOIN clubplayer          cp  ON cp.playerid                  = pi.playerid
                                      AND cp.clubid                   = tar.clubid
          JOIN genericsubscription gs  ON gs.tournamentsubscriptionid  = ts.tournamentsubscriptionid
          JOIN wonprize            wp  ON wp.genericsubscriptionid     = gs.genericsubscriptionid
          JOIN player              p   ON p.playerid                   = pi.playerid
          WHERE ts.tournamentid = ?
          ORDER BY score DESC
        `, [tournamentId])
      : await this.dataSource.query<any[]>(`
          SELECT
            NULL                        AS score,
            pi.playerid                 AS playerId,
            pi.screenname               AS screenName,
            pi.fbuid                    AS fbUid,
            pi.firstname                AS firstName,
            pi.lastname                 AS lastName,
            p.accounttype               AS accountType,
            cp.clubplayerstate          AS clubPlayerState
          FROM tournamentsubscription ts
          JOIN playerinfos         pi  ON pi.playerid                  = ts.playerid
          JOIN tournament          tr  ON tr.tournamentid              = ts.tournamentid
          JOIN tournamentarchetype tar ON tar.tournamentarchetypeid     = tr.tournamentarchetypeid
          JOIN clubplayer          cp  ON cp.playerid                  = pi.playerid
                                      AND cp.clubid                   = tar.clubid
          JOIN player              p   ON p.playerid                   = pi.playerid
          WHERE ts.tournamentid = ?
            AND ts.subscription = 0
        `, [tournamentId]);

    return rows;
  }

  // Source: Social.java → getNetworkFriends — amis directs (simplification sans traversée de graphe)
  async getNetworkFriends(playerIdFrom: number, max: number): Promise<ClubPlayerInfoDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      (SELECT pi.playerid AS playerId, pi.screenname AS screenName,
              pi.fbuid AS fbUid, pi.firstname AS firstName, pi.lastname AS lastName,
              p.accounttype AS accountType, NULL AS score, NULL AS clubState
       FROM friendrelation fr
       JOIN playerinfos  pi ON pi.playerid = fr.playeridto
       JOIN player        p  ON p.playerid  = pi.playerid
       WHERE fr.playeridfrom = ?)
      UNION
      (SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
              p.accounttype, NULL, NULL
       FROM friendrelation fr
       JOIN playerinfos  pi ON pi.playerid = fr.playeridfrom
       JOIN player        p  ON p.playerid  = pi.playerid
       WHERE fr.playeridto = ?)
      LIMIT ?
    `, [playerIdFrom, playerIdFrom, max]);

    return rows.map(r => ({ ...r, isFriend: true }));
  }

  // Source: Club.java → getNetworkClub — clubs des amis directs (simplification)
  async getNetworkClub(playerIdFrom: number, clubId: number, max: number): Promise<ClubPlayerInfoDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT DISTINCT
        pi.playerid         AS playerId,
        pi.screenname       AS screenName,
        pi.fbuid            AS fbUid,
        pi.firstname        AS firstName,
        pi.lastname         AS lastName,
        p.accounttype       AS accountType,
        NULL                AS score,
        cp.clubplayerstate  AS clubState
      FROM clubplayer cp
      JOIN playerinfos pi ON pi.playerid = cp.playerid
      JOIN player       p  ON p.playerid  = pi.playerid
      WHERE cp.clubid = ?
        AND cp.playerid != ?
        AND cp.clubplayerstate IN (0, 1, 2)
      LIMIT ?
    `, [clubId, playerIdFrom, max]);

    const playerIds = rows.map(r => r.playerId);
    const friendIds = new Set<number>();

    if (playerIds.length > 0) {
      const ph = playerIds.map(() => '?').join(',');
      const friends = await this.dataSource.query<{ playerid: number }[]>(`
        SELECT playeridto AS playerid FROM friendrelation
        WHERE playeridfrom = ? AND playeridto IN (${ph})
        UNION
        SELECT playeridfrom AS playerid FROM friendrelation
        WHERE playeridto = ? AND playeridfrom IN (${ph})
      `, [playerIdFrom, ...playerIds, playerIdFrom, ...playerIds]);
      friends.forEach(f => friendIds.add(f.playerid));
    }

    return rows.map(r => ({ ...r, isFriend: friendIds.has(r.playerId) }));
  }
}
