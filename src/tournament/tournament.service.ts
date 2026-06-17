import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SngStaticInfoDto, TournamentStaticInfoDto, TournamentDynamicInfoDto,
  BlindLevelDto, TournamentBlindStructureDto, TournamentTableDto,
  TournamentBlindInfoDto, ArchetypeDto, TablesPlayersCountDto,
  MixedSNGMissingPlayersDto, TournamentPrizeStructureDto, PrizeLevelDto,
  EventPlayerDto, CGArchetypeTableDto,
} from './dto/tournament-detail.dto';

// Calcule le niveau de blind courant et les SECONDES restantes dans ce niveau.
// ATTENTION : levelTimeMs = gti.leveltime est en MILLISECONDES (le TableServer fait
// `elapsedMs % levelTime`), alors que startTime est en secondes (UNIX_TIMESTAMP) → on
// convertit le levelTime en secondes avant de calculer.
function computeBlindLevel(startTimeSec: number, levelTimeMs: number): { level: number; timeLeft: number } {
  const levelTimeSec = Math.floor(levelTimeMs / 1000);
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

    // Prize pool = dotation réelle (rake + rebuys + addons inclus), identique à la distribution
    // serveur. Fallback sur l'approximation buyin×playersCount si la structure est indisponible.
    const ps = await this.computeDynamicPrizeStructure(tournamentId);
    const prizePool = ps ? ps.totalPrize : r.buyIn * r.playersCount;

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
    return this.computeDynamicPrizeStructure(tournamentId);
  }

  /**
   * Prize pool courant d'un tournoi à partir d'un tableId (la popup info SUR la table ne connaît
   * pas le tournamentId — INFO_TABLE ne le porte pas). On résout `gametable.tournamentid` puis on
   * réutilise le calcul dynamique (rake + rebuys + addons). Renvoie null si la table n'est pas
   * une table de tournoi.
   */
  async getPrizePoolByTable(tableId: number): Promise<{ tournamentId: number; prizePool: number } | null> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT tournamentid AS tournamentId FROM gametable
        WHERE gametableid = ? AND tournamentid IS NOT NULL`,
      [tableId],
    );
    const tournamentId = rows?.[0]?.tournamentId;
    if (tournamentId == null) return null;
    const ps = await this.computeDynamicPrizeStructure(Number(tournamentId));
    return { tournamentId: Number(tournamentId), prizePool: ps ? ps.totalPrize : 0 };
  }

  /**
   * Statut du HÉROS dans un tournoi (pour le badge « Éliminé » de la popup).
   * Un joueur encore en lice a au moins une ligne `gametableplayer` active (endts = 0) ; à
   * l'élimination le serveur pose `endts` (timestamp) + `rank` (rang final, cf.
   * GameTablePlayer.java). Donc : active = il reste une ligne endts=0 ; sinon rank = son rang
   * final (rank 1 = vainqueur, > 1 = éliminé). `rank` est un mot réservé MySQL 8 → backtické.
   */
  async getHeroTournamentStatus(
    tournamentId: number,
    playerId: number,
  ): Promise<{ active: boolean; rank: number }> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT SUM(CASE WHEN tp.endts = 0 THEN 1 ELSE 0 END) AS activeCount,
             MAX(tp.\`rank\`) AS heroRank
      FROM gametableplayer tp
      JOIN gametable gt ON gt.gametableid = tp.gametableid AND gt.tournamentid = ?
      WHERE tp.playerid = ?
    `, [tournamentId, playerId]);
    const activeCount = Number(rows?.[0]?.activeCount ?? 0);
    const heroRank    = Number(rows?.[0]?.heroRank ?? 0);
    return { active: activeCount > 0, rank: heroRank };
  }

  /**
   * Structure de prix DYNAMIQUE, fidèle au legacy (Tournament.getCurrentPrizeStructure +
   * PrizeStructureData.redistributeMoney). Les lots de base de la `prizesubstructure` (sélectionnée
   * par bracket GREATEST(playerscount, minplayers)) sont scalés : on redistribue l'argent
   * supplémentaire = buyinNetRake × (playersUsed − bracketMin) + (rebuys + addons) × buyinNetRake,
   * réparti des derniers rangs vers les premiers au prorata des lots de base (entiers, comme le
   * legacy). Le total renvoyé EST le prize pool réellement payé (rake + rebuys + addons inclus).
   *
   * NB : ces colonnes de comptage proviennent de `gametransaction` (type 25 = rebuy, 23 = addon),
   * exactement comme GameTransaction.getRebuysCount/getAddonsCount côté serveur de jeu.
   */
  private async computeDynamicPrizeStructure(tournamentId: number): Promise<TournamentPrizeStructureDto | null> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT pssrr.minrank AS minRank, pssrr.maxrank AS maxRank,
             p.type AS prizeType, p.amount AS amount, p.label AS label,
             pss.minplayerscount AS bracketMin,
             ta.buyin AS buyIn,
             GREATEST(t.playerscount, ta.minplayers) AS playersUsed,
             (SELECT tr.percentage FROM tournamentrake tr
               WHERE tr.hasvideo = ta.hasvideo ORDER BY tr.tournamentrakeid DESC LIMIT 1) AS rakePercentage
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
    if (!rows.length) return null;

    // Comptage rebuys (type 25) / addons (type 23) via les transactions du tournoi.
    const countRows = await this.dataSource.query<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM gametransaction gt
           JOIN genericsubscription gs ON gs.genericsubscriptionid = gt.genericsubscriptionid
           JOIN tournamentsubscription ts ON gs.tournamentsubscriptionid = ts.tournamentsubscriptionid AND ts.tournamentid = ?
          WHERE gt.type = 25) AS rebuysCount,
        (SELECT COUNT(*) FROM gametransaction gt
           JOIN genericsubscription gs ON gs.genericsubscriptionid = gt.genericsubscriptionid
           JOIN tournamentsubscription ts ON gs.tournamentsubscriptionid = ts.tournamentsubscriptionid AND ts.tournamentid = ?
          WHERE gt.type = 23) AS addonsCount
    `, [tournamentId, tournamentId]);
    const rebuysCount = Number(countRows[0]?.rebuysCount ?? 0);
    const addonsCount = Number(countRows[0]?.addonsCount ?? 0);

    const meta = rows[0];
    const buyIn          = Number(meta.buyIn ?? 0);
    const rakePercentage = Number(meta.rakePercentage ?? 0);
    const playersUsed    = Number(meta.playersUsed ?? 0);
    const bracketMin     = Number(meta.bracketMin ?? 0);
    const buyInMinusRake = Math.floor((buyIn * (100 - rakePercentage)) / 100);

    const isMoney = (type: number) => type === 1 || type === 4; // moneyPrize | customMoney
    const levels = rows.map(r => ({
      minRank: Number(r.minRank),
      maxRank: Number(r.maxRank),
      amount:  isMoney(Number(r.prizeType)) ? Number(r.amount) : 0,
      label:   r.label ?? '',
      nbRanks: Number(r.maxRank) - Number(r.minRank) + 1,
    }));

    // redistributeMoney(buyinNetRake×(playersUsed−bracketMin) + (rebuys+addons)×buyinNetRake)
    const amountToRedistribute =
      buyInMinusRake * (playersUsed - bracketMin) + (rebuysCount + addonsCount) * buyInMinusRake;

    let totalBasic = levels.reduce((s, l) => s + l.amount * l.nbRanks, 0);
    if (totalBasic > 0 && amountToRedistribute > 0) {
      let remaining = amountToRedistribute;
      // Des derniers rangs (perdants) vers les premiers, au prorata du lot de base (entiers).
      for (let i = levels.length - 1; i >= 0; i--) {
        const l = levels[i];
        const basicMoneyPrize = l.nbRanks * l.amount;
        const prizeToAddForRange = totalBasic > 0 ? Math.floor((remaining * basicMoneyPrize) / totalBasic) : 0;
        const prizeToAddByPlayer = Math.floor(prizeToAddForRange / l.nbRanks);
        if (prizeToAddByPlayer > 0) {
          remaining -= prizeToAddByPlayer * l.nbRanks;
          l.amount += prizeToAddByPlayer;
        }
        totalBasic -= basicMoneyPrize;
      }
      // Reliquat → rang 1 uniquement si c'est une plage à un seul rang (comme le legacy).
      const first = levels[0];
      if (first && first.minRank === first.maxRank) first.amount += remaining;
    }

    const outLevels: PrizeLevelDto[] = levels.map(l => ({
      minRank: l.minRank, maxRank: l.maxRank, amount: l.amount, label: l.label,
    }));
    const totalPrize = levels.reduce((s, l) => s + l.amount * l.nbRanks, 0);
    return { totalPrize, levels: outLevels };
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
