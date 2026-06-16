import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SngStaticInfoDto, TournamentStaticInfoDto, TournamentDynamicInfoDto,
  BlindLevelDto, TournamentBlindStructureDto, TournamentTableDto,
  TournamentBlindInfoDto, ArchetypeDto, TablesPlayersCountDto,
  MixedSNGMissingPlayersDto, TournamentPrizeStructureDto, PrizeLevelDto,
  EventPlayerDto, CGArchetypeTableDto,
} from './dto/tournament-detail.dto';

// Calcule le niveau de blind courant et les secondes restantes dans ce niveau
function computeBlindLevel(startTimeSec: number, levelTimeSec: number): { level: number; timeLeft: number } {
  const elapsed = Math.floor(Date.now() / 1000) - startTimeSec;
  if (elapsed <= 0 || levelTimeSec <= 0) return { level: 0, timeLeft: levelTimeSec };
  const level = Math.floor(elapsed / levelTimeSec);
  const timeLeft = levelTimeSec - (elapsed % levelTimeSec);
  return { level, timeLeft };
}

@Injectable()
export class TournamentService {
  constructor(private readonly dataSource: DataSource) {}

  // Source: GameTable.java → getSNGStaticInfo(turnOrTableId, subscriptionType)
  async getStaticSNGInfo(turnOrTableId: number, subscriptionType: number): Promise<SngStaticInfoDto | null> {
    if (subscriptionType === 0) {
      // SNG gametable classique
      const rows = await this.dataSource.query<any[]>(`
        SELECT gta.moneytype AS moneyType, gta.hasvideo AS hasVideo,
               gta.initstack AS initialStack, gti.leveltime AS levelDuration,
               gta.maxplayers AS tableSize
        FROM gametable gt
        JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
        JOIN gametime           gti ON gti.gametimeid           = gta.gametimeid
        WHERE gt.tabletype = 1 AND gt.gametableid = ?
      `, [turnOrTableId]);
      return rows[0] ?? null;
    } else {
      // SNG tournament (starttype = 1)
      const rows = await this.dataSource.query<any[]>(`
        SELECT ta.moneytype AS moneyType, ta.hasvideo AS hasVideo,
               ta.initstack AS initialStack, gti.leveltime AS levelDuration,
               ta.tablesize AS tableSize
        FROM tournament t
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
        JOIN gametime            gti ON gti.gametimeid          = ta.gametimeid
        WHERE t.tournamentid = ?
      `, [turnOrTableId]);
      return rows[0] ?? null;
    }
  }

  // Source: Tournament.java → getTournamentStaticInfos(tournamentId)
  async getStaticTournamentInfo(tournamentId: number): Promise<TournamentStaticInfoDto | null> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT ta.moneytype              AS moneyType,
             ta.minplayers            AS minPlayers,
             ta.hasvideo              AS hasVideo,
             ta.lastlateregisterlevel AS lastLateRegisterLevel,
             ta.structuretype         AS structureType,
             ta.addonbreakindex       AS addonBreakIndex,
             ta.initstack             AS initialStack,
             gti.leveltime            AS levelDuration,
             ta.tablesize             AS tableSize,
             UNIX_TIMESTAMP(t.starttime) AS startTime,
             ta.buyin                 AS buyIn,
             t.playerscount           AS playersCount,
             ta.starttype             AS startType,
             ta.type                  AS type,
             ta.minlevel              AS minLevel,
             ta.timeforsubscriptionsbeforestart AS timeForSubscriptions
      FROM tournament t
      JOIN tournamentarchetype ta  ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      JOIN gametime            gti ON gti.gametimeid           = ta.gametimeid
      WHERE t.tournamentid = ?
    `, [tournamentId]);

    if (!rows.length) return null;
    const r = rows[0];
    const lts = r.levelDuration; // seconds

    return {
      moneyType: r.moneyType,
      minPlayers: r.minPlayers,
      hasVideo: r.hasVideo,
      lastLateRegisterLevel: r.lastLateRegisterLevel,
      structureType: r.structureType,
      addonBreakIndex: r.addonBreakIndex,
      initialStack: r.initialStack,
      levelDuration: lts,
      tableSize: r.tableSize,
      startTime: r.startTime,
      buyIn: r.buyIn,
      playersCount: r.playersCount,
      startType: r.startType,
      type: r.type,
      minLevel: r.minLevel,
      registrationStartTime: r.startTime - (r.timeForSubscriptions ?? 0) * 60,
      rebuyAddOnEndTime: r.addonBreakIndex > 0 ? r.startTime + r.addonBreakIndex * lts : undefined,
      lateRegisterEndTime: r.lastLateRegisterLevel > 0 ? r.startTime + r.lastLateRegisterLevel * lts : undefined,
    };
  }

  // Source: Tournament.java → getTournamentDynamicInfos(tournamentId)
  async getDynamicTournamentInfo(tournamentId: number): Promise<TournamentDynamicInfoDto | null> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT t.playerscount           AS playersCount,
             t.ingameplayerscount     AS inGamePlayersCount,
             t.gamestate              AS gameState,
             t.subscriptionstate      AS subscriptionState,
             UNIX_TIMESTAMP(t.starttime) AS startTime,
             ta.addonbreakindex       AS addonBreakIndex,
             ta.lastlateregisterlevel AS lastLateRegisterLevel,
             ta.starttype             AS startType,
             ta.buyin                 AS buyIn,
             gti.leveltime            AS levelDuration
      FROM tournament t
      JOIN tournamentarchetype ta  ON t.tournamentarchetypeid = ta.tournamentarchetypeid
      JOIN gametime            gti ON gti.gametimeid          = ta.gametimeid
      WHERE t.tournamentid = ?
    `, [tournamentId]);

    if (!rows.length) return null;
    const r = rows[0];

    const { level, timeLeft } = computeBlindLevel(r.startTime, r.levelDuration);

    // Prize pool simplifié: buyin * playersCount (approximation sans rake exact)
    const prizePool = r.buyIn * r.playersCount;

    // Break end: si on est en break (gameState=2), le break dure 1 niveau
    const breakEnd = r.gameState === 2
      ? Math.floor(Date.now() / 1000) + timeLeft
      : undefined;

    return {
      playersCount: r.playersCount,
      inGamePlayersCount: r.inGamePlayersCount,
      gameState: r.gameState,
      subscriptionState: r.subscriptionState,
      prizePool,
      breakEnd,
      blindLevel: level,
      startTime: r.startTime,
    };
  }

  // Source: Tournament.java → getTournamentBlindStructure(tournamentId)
  async getTournamentBlindStructure(tournamentId: number): Promise<TournamentBlindStructureDto | null> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT gti.leveltime AS levelTime, ta.blindstructureid AS blindStructureId
      FROM tournament t
      JOIN tournamentarchetype ta  ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      JOIN gametime            gti ON gti.gametimeid           = ta.gametimeid
      WHERE t.tournamentid = ?
    `, [tournamentId]);

    if (!rows.length) return null;
    const { levelTime, blindStructureId } = rows[0];

    // NB : la table blindlevel n'a PAS de colonne d'ordre/PK (juste blindstructureid +
    // blindvaluesid). Le legacy s'appuie sur l'ordre d'insertion. Comme les blindes croissent
    // à chaque niveau, on ordonne par bigblind/smallblind/ante (déterministe et correct).
    const levels = await this.dataSource.query<BlindLevelDto[]>(`
      SELECT bv.smallblind AS smallBlind, bv.bigblind AS bigBlind, bv.ante AS ante
      FROM blindlevel bl
      JOIN blindvalues bv ON bv.blindvaluesid = bl.blindvaluesid
      WHERE bl.blindstructureid = ?
      ORDER BY bv.bigblind ASC, bv.smallblind ASC, bv.ante ASC
    `, [blindStructureId]);

    return { levelTime, levels };
  }

  // Source: PrizeStructure.java → getCurrentSubstructureForTournament(tournamentId)
  // VRAIE structure de prix : la tranche de prizesubstructure correspondant au nombre de
  // joueurs inscrits (GREATEST(playerscount, minplayers)), avec ses plages de rangs et lots.
  // prize.type (PrizesCodes) : 1=money, 4=customMoney (amount en jetons, unité d'affichage),
  // 2=ticket, 3=objet (label).
  async getTournamentPrizeStructure(tournamentId: number): Promise<TournamentPrizeStructureDto | null> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT pssrr.minrank AS minRank, pssrr.maxrank AS maxRank,
             p.type AS prizeType, p.amount AS amount, p.label AS label
      FROM tournament t
      JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
      JOIN prizesubstructure pss
        ON pss.prizestructureid = ta.prizestructureid
       AND pss.minplayerscount <= GREATEST(t.playerscount, ta.minplayers)
       AND pss.maxplayerscount >= GREATEST(t.playerscount, ta.minplayers)
      JOIN prizesubstructurerankrange pssrr ON pssrr.prizesubstructureid = pss.prizesubstructureid
      JOIN prize p ON pssrr.prizeid = p.prizeid
      WHERE t.tournamentid = ?
      ORDER BY pssrr.minrank ASC
    `, [tournamentId]);

    const isMoney = (type: number) => type === 1 || type === 4; // moneyPrize | customMoney
    const levels: PrizeLevelDto[] = rows.map(r => ({
      minRank: Number(r.minRank),
      maxRank: Number(r.maxRank),
      amount:  isMoney(Number(r.prizeType)) ? Number(r.amount) : 0,
      label:   r.label ?? '',
    }));

    // Dotation affichée = somme des gains money de la structure courante.
    const totalPrize = levels.reduce((s, l) => s + l.amount, 0);
    return { totalPrize, levels };
  }

  // Source: Tournament.java → getTablesTournamentInfo(tournamentId)
  getTournamentTables(tournamentId: number): Promise<TournamentTableDto[]> {
    return this.dataSource.query<TournamentTableDto[]>(`
      SELECT gt.gametableid     AS tableId,
             gt.playerscount    AS playersCount,
             min(tp.stack)      AS minStack,
             max(tp.stack)      AS maxStack
      FROM gametableplayer tp
      JOIN gametable gt ON gt.gametableid = tp.gametableid AND gt.tournamentid = ?
      WHERE tp.endts = 0
      GROUP BY gt.gametableid
    `, [tournamentId]);
  }

  // Source: Tournament.java → getTournamentBlindInfo(tournamentId)
  async getTournamentBlindInfo(tournamentId: number): Promise<TournamentBlindInfoDto | null> {
    const structure = await this.getTournamentBlindStructure(tournamentId);
    if (!structure) return null;

    const rows = await this.dataSource.query<{ startTime: number }[]>(`
      SELECT UNIX_TIMESTAMP(t.starttime) AS startTime
      FROM tournament t WHERE t.tournamentid = ?
    `, [tournamentId]);
    if (!rows.length) return null;

    const { level, timeLeft } = computeBlindLevel(rows[0].startTime, structure.levelTime);
    const current = structure.levels[level] ?? structure.levels[structure.levels.length - 1];
    const next = structure.levels[level + 1];

    return {
      blindLevel: level,
      levelTimeLeft: timeLeft,
      currentSmallBlind: current?.smallBlind ?? 0,
      currentBigBlind: current?.bigBlind ?? 0,
      currentAnte: current?.ante ?? 0,
      nextSmallBlind: next?.smallBlind,
      nextBigBlind: next?.bigBlind,
      nextAnte: next?.ante,
    };
  }

  // Source: TableArchetype.java → getSubscribableTableArchetypes(clientId)
  getSubscribableTableArchetypes(): Promise<ArchetypeDto[]> {
    return this.dataSource.query<ArchetypeDto[]>(`
      SELECT gta.gametablearchetypeid AS tableArchetypeId,
             gta.label, gta.maxplayers AS maxPlayers,
             gta.buyin AS buyIn, gta.moneytype AS moneyType,
             gta.gametype AS gameType, gta.limittype AS limitType,
             gta.hasvideo AS hasVideo, gta.type
      FROM gametablearchetype gta
      WHERE gta.type IN (2, 3)
      ORDER BY gta.buyin ASC
    `);
  }

  // Source: TableArchetype.java → getPublicSNGTableWaitingSubscriptions(tableArchetypeId)
  async getPublicSNGTableWaitingSubscriptions(tableArchetypeId: number): Promise<{ count: number }> {
    const rows = await this.dataSource.query<{ nb: number }[]>(`
      SELECT COUNT(*) AS nb
      FROM genericsubscription gs
      JOIN gametablearchetypesubscription gtas ON gs.gametablearchetypesubscriptionid = gtas.gametablearchetypesubscriptionid
      WHERE gtas.gametablearchetypeid = ?
        AND gtas.subscription = 0
        AND gs.gametableplayerid IS NULL
    `, [tableArchetypeId]);
    return { count: Number(rows[0].nb) };
  }

  // Source: TableArchetype.java → getMixedSNGPendingTablesCount(sex, tableArchetypeId)
  async getMixedSNGPendingTablesCount(sex: number, tableArchetypeId: number): Promise<{ count: number }> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT gtas.playerid, pi.sex
      FROM genericsubscription gs
      JOIN gametablearchetypesubscription gtas ON gs.gametablearchetypesubscriptionid = gtas.gametablearchetypesubscriptionid
      JOIN playerinfos pi ON pi.playerid = gtas.playerid
      WHERE gtas.gametablearchetypeid = ?
        AND gtas.subscription = 0
        AND gs.gametableplayerid IS NULL
      ORDER BY gtas.subscriptionts ASC
    `, [tableArchetypeId]);

    const tableSize = await this.getArchetypeTableSize(tableArchetypeId);
    const half = Math.floor(tableSize / 2);

    // Java convention (playerinfos.sex): 0 = man, 1 = woman
    let men = 0, women = 0;
    for (const r of rows) {
      if (r.sex === 0) men++;
      else women++;
    }

    const menTables = Math.floor(men / half);
    const womenTables = Math.floor(women / half);
    const count = sex === 0 ? menTables : womenTables;
    return { count };
  }

  // Source: TableArchetype.java → getMixedGendersSNGNextTableMissingPlayers(tableArchetypeId, playerId)
  async getMixedGendersSNGNextTableMissingPlayers(
    tableArchetypeId: number, playerId: number,
  ): Promise<MixedSNGMissingPlayersDto> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT gtas.playerid, pi.sex
      FROM genericsubscription gs
      JOIN gametablearchetypesubscription gtas ON gs.gametablearchetypesubscriptionid = gtas.gametablearchetypesubscriptionid
      JOIN playerinfos pi ON pi.playerid = gtas.playerid
      WHERE gtas.gametablearchetypeid = ?
        AND gtas.subscription = 0
        AND gs.gametableplayerid IS NULL
      ORDER BY gtas.subscriptionts ASC
    `, [tableArchetypeId]);

    const tableSize = await this.getArchetypeTableSize(tableArchetypeId);
    const half = Math.floor(tableSize / 2);

    // Compte jusqu'à la position du joueur (sex: 0 = homme, 1 = femme)
    let men = 0, women = 0;
    for (const r of rows) {
      if (r.playerid === playerId) break;
      if (r.sex === 0) men++;
      else women++;
    }

    const menInCurrentTable = men % half;
    const womenInCurrentTable = women % half;

    return {
      menMissingCount: Math.max(0, half - menInCurrentTable),
      womenMissingCount: Math.max(0, half - womenInCurrentTable),
    };
  }

  // Source: TableArchetype.java → getMixedSNGPendingTablesCountSubscribed(sex, tableArchetypeId, playerId)
  async getMixedSNGPendingTablesCountSubscribed(
    sex: number, tableArchetypeId: number, playerId: number,
  ): Promise<{ count: number }> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT gtas.playerid, pi.sex
      FROM genericsubscription gs
      JOIN gametablearchetypesubscription gtas ON gs.gametablearchetypesubscriptionid = gtas.gametablearchetypesubscriptionid
      JOIN playerinfos pi ON pi.playerid = gtas.playerid
      WHERE gtas.gametablearchetypeid = ?
        AND gtas.subscription = 0
        AND gs.gametableplayerid IS NULL
      ORDER BY gtas.subscriptionts ASC
    `, [tableArchetypeId]);

    const tableSize = await this.getArchetypeTableSize(tableArchetypeId);
    const half = Math.floor(tableSize / 2);

    let men = 0, women = 0;
    for (const r of rows) {
      if (r.playerid === playerId) break;
      if (r.sex === 0) men++;
      else women++;
    }

    const count = sex === 0 ? Math.floor(men / half) : Math.floor(women / half);
    return { count };
  }

  // Source: Player.java → getEventPlayers — joueurs connectés via une session active
  getEventPlayers(): Promise<EventPlayerDto[]> {
    return this.dataSource.query<EventPlayerDto[]>(`
      SELECT DISTINCT pi.playerid AS playerId, pi.screenname AS screenName, pi.fbuid AS fbUid
      FROM connection c
      JOIN player       p  ON p.playerid  = c.playerid
      JOIN playerinfos  pi ON pi.playerid = c.playerid
      WHERE c.endts = 0
      ORDER BY pi.screenname ASC
    `);
  }

  // Source: Facebook.java → getOnlineFacebookAppUsers(userUid, fbUids[])
  async getOnlineFacebookAppUsers(fbUids: string[]): Promise<EventPlayerDto[]> {
    if (!fbUids.length) return [];
    const ph = fbUids.map(() => '?').join(',');
    return this.dataSource.query<EventPlayerDto[]>(`
      SELECT DISTINCT pi.playerid AS playerId, pi.screenname AS screenName, pi.fbuid AS fbUid
      FROM playerinfos pi
      JOIN connection c ON c.playerid = pi.playerid AND c.endts = 0
      WHERE pi.fbuid IN (${ph})
    `, fbUids);
  }

  // Source: GameTable.java → getTablesPlayersCount(tables[])
  async getTablesPlayersCount(tableIds: number[]): Promise<TablesPlayersCountDto[]> {
    if (!tableIds.length) return [];
    const ph = tableIds.map(() => '?').join(',');
    return this.dataSource.query<TablesPlayersCountDto[]>(`
      SELECT gametableid AS tableId, playerscount AS playersCount
      FROM gametable
      WHERE gametableid IN (${ph})
    `, tableIds);
  }

  // Source: GameTableArchetype.java → getCGArchetypeTable(tableArchetypeId)
  async getCGArchetypeTable(tableArchetypeId: number): Promise<CGArchetypeTableDto | null> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT gta.gametablearchetypeid AS tableArchetypeId,
             gta.label, gta.maxplayers AS maxPlayers,
             bv.smallblind AS smallBlind, bv.bigblind AS bigBlind,
             gta.moneytype AS moneyType, gta.gametype AS gameType,
             gta.limittype AS limitType
      FROM gametablearchetype gta
      JOIN blindlevel  bl ON bl.blindstructureid = gta.blindstructureid
      JOIN blindvalues bv ON bv.blindvaluesid    = bl.blindvaluesid
      WHERE gta.gametablearchetypeid = ?
      LIMIT 1
    `, [tableArchetypeId]);
    return rows[0] ?? null;
  }

  private async getArchetypeTableSize(tableArchetypeId: number): Promise<number> {
    const rows = await this.dataSource.query<{ maxplayers: number }[]>(
      `SELECT maxplayers FROM gametablearchetype WHERE gametablearchetypeid = ? LIMIT 1`,
      [tableArchetypeId],
    );
    return rows[0]?.maxplayers ?? 9;
  }
}
