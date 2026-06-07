import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GametablePlayerEntity } from './entities/gametable-player.entity';
import { TournamentSubscriptionEntity } from './entities/tournament-subscription.entity';
import { CgTableDto } from './dto/cg-table.dto';
import { SngTableDto } from './dto/sng-table.dto';
import { TournamentDto } from './dto/tournament.dto';
import { PlayerStackDto } from './dto/player-stack.dto';
import { SubscribableArchetypeDto } from './dto/subscribable-archetype.dto';

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
  // Source: GameTable.java → getCGTables()
  // launchstate=2 (running), tabletype=0 (cashgame)

  getCGTables(): Promise<CgTableDto[]> {
    return this.dataSource.query<CgTableDto[]>(`
      SELECT
        gt.gametableid  AS tableId,
        gta.label       AS label,
        gta.minplayers  AS minPlayers,
        gta.maxplayers  AS maxPlayers,
        bv.smallblind   AS smallBlind,
        bv.bigblind     AS bigBlind,
        gta.moneytype   AS moneyType,
        gta.gametype    AS gameType,
        gta.limittype   AS limitType,
        gta.hasvideo    AS hasVideo,
        gt.playerscount AS nbPlayers
      FROM gametable gt
      JOIN gametablearchetype gta ON gt.gametablearchetypeid = gta.gametablearchetypeid
      JOIN blindlevel         bl  ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues        bv  ON bv.blindvaluesid    = bl.blindvaluesid
      WHERE gt.launchstate = 2
        AND gt.tabletype   = 0
      ORDER BY gt.gamestate ASC
    `);
  }

  // Source: GameTable.java → getRunningPrivateCGTables(ownerId)
  // gta.type = 1 (private archetype type)

  getPrivateCGTables(playerId: number): Promise<CgTableDto[]> {
    return this.dataSource.query<CgTableDto[]>(`
      SELECT
        gt.gametableid  AS tableId,
        gta.label       AS label,
        gta.minplayers  AS minPlayers,
        gta.maxplayers  AS maxPlayers,
        bv.smallblind   AS smallBlind,
        bv.bigblind     AS bigBlind,
        gta.moneytype   AS moneyType,
        gta.gametype    AS gameType,
        gta.limittype   AS limitType,
        gta.hasvideo    AS hasVideo,
        gt.playerscount AS nbPlayers
      FROM gametable gt
      JOIN gametablearchetype gta ON gt.gametablearchetypeid = gta.gametablearchetypeid
                                  AND gta.type = 1
      JOIN blindlevel         bl  ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues        bv  ON bv.blindvaluesid    = bl.blindvaluesid
      WHERE gt.ownerplayerid = ?
        AND gt.gamestate   IN (0, 1, 2)
        AND gt.launchstate IN (0, 1, 2)
      ORDER BY gt.gamestate ASC
    `, [playerId]);
  }

  getOwnerPrivateCGTables(ownerId: number): Promise<CgTableDto[]> {
    return this.dataSource.query<CgTableDto[]>(`
      SELECT
        gt.gametableid  AS tableId,
        gta.label       AS label,
        gta.minplayers  AS minPlayers,
        gta.maxplayers  AS maxPlayers,
        bv.smallblind   AS smallBlind,
        bv.bigblind     AS bigBlind,
        gta.moneytype   AS moneyType,
        gta.gametype    AS gameType,
        gta.limittype   AS limitType,
        gta.hasvideo    AS hasVideo,
        gt.playerscount AS nbPlayers
      FROM gametable gt
      JOIN gametablearchetype gta ON gt.gametablearchetypeid = gta.gametablearchetypeid
                                  AND gta.type = 1
      JOIN blindlevel         bl  ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues        bv  ON bv.blindvaluesid    = bl.blindvaluesid
      WHERE gt.ownerplayerid = ?
        AND gt.gamestate   IN (0, 1, 2)
        AND gt.launchstate IN (0, 1, 2)
      ORDER BY gt.gamestate ASC
    `, [ownerId]);
  }

  // ── SNG Tables ────────────────────────────────────────────────────────────
  // Source: GameTable.java → getSNGTables()
  // Deux sources : gametable (tabletype=1) + tournament (starttype=0 = maxPlayersReached = SNG)

  async getSNGTables(): Promise<SngTableDto[]> {
    const [sngTables, sngTournaments] = await Promise.all([
      // SNG gametables classiques (tabletype = 1)
      this.dataSource.query<SngTableDto[]>(`
        SELECT
          gt.gametableid  AS tableOrTournId,
          gta.label       AS label,
          gta.minplayers  AS minPlayers,
          gta.maxplayers  AS maxPlayers,
          gta.moneytype   AS moneyType,
          gta.gametype    AS gameType,
          gta.limittype   AS limitType,
          gta.hasvideo    AS hasVideo,
          gt.playerscount AS nbPlayers,
          gta.buyin       AS buyIn,
          gt.gamestate    AS gameState,
          0               AS subscriptionState,
          0               AS subscriptionType,
          0               AS structureType,
          (SELECT percentage FROM tournamentrake tr
            WHERE tr.hasvideo = gta.hasvideo
            ORDER BY tournamentrakeid DESC LIMIT 1) AS rakePercentage
        FROM gametable gt
        JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
        WHERE gt.tabletype = 1
          AND (
            (gt.launchstate = 0 AND gt.gamestate = 1)
            OR  (gt.launchstate = 2 AND gt.gamestate = 2)
          )
        ORDER BY gt.gamestate ASC
      `),
      // SNG tournaments (starttype = 0 = maxPlayersReached, gamestate=1=subscription = en attente de joueurs)
      this.dataSource.query<SngTableDto[]>(`
        SELECT
          t.tournamentid      AS tableOrTournId,
          t.label             AS label,
          ta.minplayers       AS minPlayers,
          ta.maxplayers       AS maxPlayers,
          ta.moneytype        AS moneyType,
          ta.gametype         AS gameType,
          ta.limittype        AS limitType,
          ta.hasvideo         AS hasVideo,
          t.playerscount      AS nbPlayers,
          ta.buyin            AS buyIn,
          t.gamestate         AS gameState,
          t.subscriptionstate AS subscriptionState,
          0                   AS subscriptionType,
          ta.structuretype    AS structureType,
          NULL                AS rakePercentage
        FROM tournament t
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
        WHERE ta.starttype = 0
          AND t.gamestate        IN (0, 1, 2)
          AND t.subscriptionstate IN (0, 1)
        ORDER BY t.gamestate ASC
      `),
    ]);

    return [...sngTables, ...sngTournaments];
  }

  // ── Tournaments ───────────────────────────────────────────────────────────
  // Source: Tournament.java → getTournaments(clientId)
  // starttype = 1 (scheduled), gamestate IN (0,1,2,3)

  getTournaments(): Promise<TournamentDto[]> {
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
      WHERE ta.starttype = 1
        AND t.gamestate IN (0, 1, 2, 3)
        AND ta.clubid IS NULL
      ORDER BY t.starttime ASC, ta.periodtype ASC
    `);
  }

  // Source: Tournament.java → getClubTournaments(playerId)
  // Tournois du club auquel appartient le joueur

  getPrivateTournaments(playerId: number): Promise<TournamentDto[]> {
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
      JOIN clubplayer          cp ON cp.clubid   = ta.clubid
                                 AND cp.playerid = ?
      WHERE ta.starttype = 1
        AND t.gamestate IN (0, 1, 2, 3)
      ORDER BY t.starttime ASC, ta.periodtype ASC
    `, [playerId]);
  }

  // Source: Tournament.java → getClubTournaments(clubId) limited
  // Tournois d'un club spécifique (owner = le club du joueur)

  getOwnerPrivateTournaments(ownerId: number): Promise<TournamentDto[]> {
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
    `, [ownerId]);
  }

  // ── Players ───────────────────────────────────────────────────────────────
  // Source: GameTablePlayer.java → getActiveTablePlayersStacks(tableId)
  // pi.screenname est une vraie colonne de playerinfos

  getTablePlayers(tableId: number): Promise<PlayerStackDto[]> {
    return this.dataSource.query<PlayerStackDto[]>(`
      SELECT
        pi.screenname AS screenName,
        tp.stack      AS stack,
        tp.rank       AS \`rank\`,
        tp.playerid   AS playerId
      FROM gametableplayer tp
      JOIN playerinfos pi ON tp.playerid = pi.playerid
      WHERE tp.gametableid = ?
        AND tp.endts = 0
      ORDER BY tp.rank ASC, tp.stack DESC
    `, [tableId]);
  }

  // Source: GameTablePlayer.java → getActiveTournamentPlayersStacks(tournamentId)
  //       + GameTablePlayer.java → getPreTournamentPlayersStacks(tournamentId)
  // Gère les deux cas : tournoi démarré (gametableplayer) et non démarré (tournamentsubscription)

  async getTournamentPlayers(tourId: number): Promise<PlayerStackDto[]> {
    // Cas 1 : tournoi démarré → joueurs assis en table
    const activePlayers = await this.dataSource.query<PlayerStackDto[]>(`
      SELECT
        pi.screenname AS screenName,
        tp.stack      AS stack,
        tp.rank       AS \`rank\`,
        tp.playerid   AS playerId
      FROM gametableplayer tp
      JOIN playerinfos pi ON tp.playerid    = pi.playerid
      JOIN gametable   gt ON gt.gametableid = tp.gametableid
                          AND gt.tournamentid = ?
      WHERE tp.endts = 0 OR tp.rank > 0
      ORDER BY tp.rank ASC, tp.stack DESC
    `, [tourId]);

    if (activePlayers.length > 0) {
      return activePlayers;
    }

    // Cas 2 : tournoi pas encore démarré → inscrits via tournamentsubscription
    return this.dataSource.query<PlayerStackDto[]>(`
      SELECT
        pi.screenname   AS screenName,
        ta.initstack    AS stack,
        0               AS \`rank\`,
        ts.playerid     AS playerId
      FROM tournamentsubscription ts
      JOIN tournament         t  ON t.tournamentid          = ts.tournamentid
      JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      JOIN playerinfos        pi ON ts.playerid             = pi.playerid
      WHERE t.tournamentid = ?
        AND t.gamestate  = 0
        AND ts.subscription = 0
    `, [tourId]);
  }

  // ── Subscribable Archetypes ───────────────────────────────────────────────
  // Source: GameTableArchetype.java → getSubscribableArchetypes()
  // SNG non-classic (tabletype=1, type != 0) → ex. CamDate (mixedGendersSNG)
  // clientId=0 → clientid IS NULL (archetypes publics)

  getSubscribableArchetypes(clientId = 0): Promise<SubscribableArchetypeDto[]> {
    return clientId > 0
      ? this.dataSource.query<SubscribableArchetypeDto[]>(`
          SELECT gta.gametablearchetypeid AS archetypeId,
                 gta.type                AS archetypeType,
                 gta.tabletype           AS tableType,
                 gta.maxplayers          AS tableSize,
                 gta.buyin               AS buyIn,
                 gta.hasvideo            AS hasVideo,
                 gta.label               AS label
          FROM gametablearchetype gta
          WHERE gta.isvalid = 1
            AND gta.clientid = ?
            AND gta.type != 0
            AND gta.tabletype = 1
          ORDER BY gta.maxplayers ASC, gta.buyin ASC
        `, [clientId])
      : this.dataSource.query<SubscribableArchetypeDto[]>(`
          SELECT gta.gametablearchetypeid AS archetypeId,
                 gta.type                AS archetypeType,
                 gta.tabletype           AS tableType,
                 gta.maxplayers          AS tableSize,
                 gta.buyin               AS buyIn,
                 gta.hasvideo            AS hasVideo,
                 gta.label               AS label
          FROM gametablearchetype gta
          WHERE gta.isvalid = 1
            AND gta.clientid IS NULL
            AND gta.type != 0
            AND gta.tabletype = 1
          ORDER BY gta.maxplayers ASC, gta.buyin ASC
        `);
  }
}
