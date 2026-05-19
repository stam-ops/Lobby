import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RankEntryDto, PlayerRankRowDto, PlayerRankingDto, DailyResultDto } from './dto/rank-entry.dto';

const PERIOD_FILTER: Record<number, string> = {
  0: '',                                                                                                                             // all time
  1: `AND YEAR({{ts}})=YEAR(now()) AND MONTH({{ts}})=MONTH(now())`,                                                               // current month
  2: `AND MONTH({{ts}})=MONTH(now())-1`,                                                                                           // last month
  3: `AND {{ts}}>(CURDATE() - INTERVAL weekday(now()) DAY)`,                                                                       // current week
  4: `AND {{ts}}>=(CURDATE() - INTERVAL DAYOFWEEK(CURDATE())+6 DAY) AND {{ts}}<(CURDATE() - INTERVAL DAYOFWEEK(CURDATE())-1 DAY)`, // last week
};

function periodFilter(period: number, tsCol: string): string {
  const tpl = PERIOD_FILTER[period] ?? '';
  return tpl.replace(/\{\{ts\}\}/g, tsCol);
}

const DAILY_HOUR_MAP: Record<number, string> = {
  1: '01:00:00', 2: '09:00:00', 3: '11:00:00', 4: '13:00:00', 5: '15:00:00',
  6: '17:00:00', 7: '19:00:00', 8: '21:00:00', 9: '22:00:00', 10: '23:00:00',
};

@Injectable()
export class RankingService {
  constructor(private readonly dataSource: DataSource) {}

  // Source: Challenges.java → getResultsDaily(number)
  async getResultsDaily(number: number): Promise<DailyResultDto[]> {
    const hour = DAILY_HOUR_MAP[number];
    if (!hour) return [];

    const tournaments = await this.dataSource.query<{ tournamentid: number }[]>(`
      SELECT tournamentid FROM tournament
      WHERE starttime = CONCAT(CURDATE() - INTERVAL 1 DAY, ' ', ?)
      LIMIT 1
    `, [hour]);

    if (!tournaments.length) return [];
    const tournamentId = tournaments[0].tournamentid;

    return this.dataSource.query<DailyResultDto[]>(`
      SELECT
        pi.screenname   AS screenName,
        pi.fbuid        AS fbUid,
        wp.amount       AS amount,
        gtp.rank        AS \`rank\`,
        pa.gamescore    AS gameScore,
        pp.label        AS lot
      FROM gametableplayer gtp
      JOIN gametable                gt  ON gt.tournamentid  = ? AND gt.gametableid = gtp.gametableid
      JOIN playerinfos              pi  ON pi.playerid      = gtp.playerid
      JOIN player                   p   ON p.playerid       = gtp.playerid
      JOIN tournamentsubscription   ts  ON ts.playerid      = gtp.playerid
                                       AND ts.tournamentid  = gt.tournamentid
                                       AND ts.subscription  = 0
      JOIN genericsubscription      gs  ON gs.tournamentsubscriptionid = ts.tournamentsubscriptionid
      JOIN wonprize                 wp  ON wp.genericsubscriptionid    = gs.genericsubscriptionid
      JOIN playeraccount            pa  ON pa.playerid      = gtp.playerid
      JOIN prize                    pp  ON pp.prizeid       = wp.prizeid
      WHERE gtp.rank != 0
      ORDER BY gtp.rank ASC
    `, [tournamentId]);
  }

  // Source: Challenges.java → getTopWinTournament(number) + period variants
  getTopWinTournamentWithPeriod(number: number, period: number): Promise<RankEntryDto[]> {
    const pf = periodFilter(period, 'gtp.startts');
    return this.dataSource.query<RankEntryDto[]>(`
      SELECT
        pi.screenname               AS screenName,
        pi.fbuid                    AS fbUid,
        sum(tr.playerscount)        AS score,
        count(*)                    AS nb,
        pa.gamescore                AS gameScore
      FROM playerinfos pi
      JOIN gametableplayer gtp ON gtp.playerid = pi.playerid
                               AND gtp.rank = 1
                               ${pf}
      JOIN gametable gt        ON gt.gametableid = gtp.gametableid
                               AND gt.gametablearchetypeid IS NULL
      JOIN tournament tr       ON tr.tournamentid = gt.tournamentid
      JOIN playeraccount pa    ON pa.playerid = pi.playerid
      GROUP BY pi.fbuid
      ORDER BY score DESC
      LIMIT ?
    `, [number]);
  }

  // Source: Challenges.java → getRankTournament(number) + period variants
  getRankTournamentWithPeriod(number: number, period: number): Promise<RankEntryDto[]> {
    const pf = periodFilter(period, 'ts.subscriptionts');
    return this.dataSource.query<RankEntryDto[]>(`
      SELECT
        pi.screenname       AS screenName,
        pi.fbuid            AS fbUid,
        sum(wp.amount)      AS score,
        count(*)            AS nb,
        pa.gamescore        AS gameScore
      FROM playerinfos pi
      JOIN tournamentsubscription ts ON ts.playerid = pi.playerid
                                     ${pf}
      JOIN genericsubscription    gs ON gs.tournamentsubscriptionid = ts.tournamentsubscriptionid
      JOIN wonprize               wp ON wp.genericsubscriptionid    = gs.genericsubscriptionid
      JOIN playeraccount          pa ON pa.playerid                 = pi.playerid
      GROUP BY pi.fbuid
      ORDER BY score DESC
      LIMIT ?
    `, [number]);
  }

  // Source: Challenges.java → getRankSNG(number) + period variants
  getRankSNGWithPeriod(number: number, period: number): Promise<RankEntryDto[]> {
    const pf = periodFilter(period, 'gtp.startts');
    return this.dataSource.query<RankEntryDto[]>(`
      SELECT
        pi.screenname   AS screenName,
        pi.fbuid        AS fbUid,
        count(*)        AS nb,
        pa.gamescore    AS gameScore,
        sum(wp.amount)  AS score
      FROM playerinfos pi
      JOIN gametableplayer gtp ON gtp.playerid = pi.playerid
                               ${pf}
      JOIN gametable gt        ON gt.gametableid = gtp.gametableid
                               AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
      JOIN genericsubscription gs  ON gs.gametableplayerid   = gtp.gametableplayerid
      JOIN wonprize            wp  ON wp.genericsubscriptionid = gs.genericsubscriptionid
      JOIN playeraccount       pa  ON pa.playerid             = pi.playerid
      GROUP BY pi.fbuid
      ORDER BY score DESC
      LIMIT ?
    `, [number]);
  }

  // Source: Challenges.java → getRankCash + period variants
  async getRankCashGameWithPeriod(number: number, period: number): Promise<RankEntryDto[]> {
    const pf = periodFilter(period, 'gt.createts');

    const [cashInRows, cashOutRows] = await Promise.all([
      this.dataSource.query<{ fbuid: string; screenName: string; gameScore: number; cashIn: number }[]>(`
        SELECT pi.fbuid, pi.screenname AS screenName, pa.gamescore AS gameScore, SUM(gt.amount) AS cashIn
        FROM gametransaction gt
        JOIN playerinfos  pi ON pi.playerid = gt.playerid
        JOIN playeraccount pa ON pa.playerid = gt.playerid
        WHERE gt.type IN (0, 1)
          ${pf}
        GROUP BY pi.fbuid
      `),
      this.dataSource.query<{ fbuid: string; cashOut: number }[]>(`
        SELECT pi.fbuid, SUM(gt.amount) AS cashOut
        FROM gametransaction gt
        JOIN playerinfos pi ON pi.playerid = gt.playerid
        WHERE gt.type = 2
          ${pf}
        GROUP BY pi.fbuid
      `),
    ]);

    const cashOutMap = new Map(cashOutRows.map(r => [r.fbuid, r.cashOut]));
    const results: RankEntryDto[] = cashInRows
      .map(r => ({
        screenName: r.screenName,
        fbUid: r.fbuid,
        score: (cashOutMap.get(r.fbuid) ?? 0) - r.cashIn,
        nb: 0,
        gameScore: r.gameScore,
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, number);

    return results;
  }

  // Source: Challenges.java → getRankAll — merge cashgame + tournament + SNG
  async getRankAllWithPeriod(number: number, period: number): Promise<RankEntryDto[]> {
    const [cash, tournament, sng] = await Promise.all([
      this.getRankCashGameWithPeriod(number, period),
      this.getRankTournamentWithPeriod(number, period),
      this.getRankSNGWithPeriod(number, period),
    ]);

    const byFbUid = new Map<string, RankEntryDto>();
    for (const r of [...cash, ...tournament, ...sng]) {
      const existing = byFbUid.get(r.fbUid);
      if (existing) {
        existing.score += r.score;
        existing.nb += r.nb;
      } else {
        byFbUid.set(r.fbUid, { ...r });
      }
    }

    return [...byFbUid.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, number);
  }

  // Source: PlayerAccount.java → getPlayerGameScoreRow + getRankedPlayersBefore/After
  async getPlayerRanking(playerId: number, nBefore: number, nAfter: number): Promise<PlayerRankingDto> {
    const playerRows = await this.dataSource.query<any[]>(`
      SELECT
        pa.gamescore, pa.socialscore, pi.screenname, pi.fbuid,
        p.accounttype, UNIX_TIMESTAMP(p.endvipts) AS endVipTs, p.subscription,
        ((SELECT COUNT(*) FROM playeraccount pa2
          WHERE pa2.gamescore + pa2.socialscore > pa.gamescore + pa.socialscore) + 1) AS \`rank\`
      FROM playeraccount pa
      JOIN playerinfos pi ON pi.playerid = pa.playerid
      JOIN player      p  ON p.playerid  = pa.playerid
      WHERE pa.playerid = ?
    `, [playerId]);

    if (!playerRows.length) {
      return { rank: 0, player: null, before: [], after: [] };
    }

    const pr = playerRows[0];
    const totalScore = pr.gamescore + pr.socialscore;

    const mapRow = (r: any): PlayerRankRowDto => ({
      playerId: r.playerid ?? playerId,
      screenName: r.screenname,
      fbUid: r.fbuid,
      gameScore: r.gamescore,
      socialScore: r.socialscore,
      accountType: r.accounttype,
      endVipTs: r.endVipTs,
      subscription: r.subscription,
    });

    const [before, after] = await Promise.all([
      this.dataSource.query<any[]>(`
        SELECT pi.playerid, pa.gamescore, pa.socialscore, pi.screenname, pi.fbuid,
               p.accounttype, UNIX_TIMESTAMP(p.endvipts) AS endVipTs, p.subscription
        FROM playeraccount pa
        JOIN playerinfos pi ON pi.playerid = pa.playerid
        JOIN player      p  ON p.playerid  = pa.playerid
        WHERE pa.gamescore + pa.socialscore > ? AND pa.playerid != ?
        ORDER BY pa.gamescore + pa.socialscore ASC
        LIMIT ?
      `, [totalScore, playerId, nBefore]),
      this.dataSource.query<any[]>(`
        SELECT pi.playerid, pa.gamescore, pa.socialscore, pi.screenname, pi.fbuid,
               p.accounttype, UNIX_TIMESTAMP(p.endvipts) AS endVipTs, p.subscription
        FROM playeraccount pa
        JOIN playerinfos pi ON pi.playerid = pa.playerid
        JOIN player      p  ON p.playerid  = pa.playerid
        WHERE pa.gamescore + pa.socialscore < ? AND pa.playerid != ?
        ORDER BY pa.gamescore + pa.socialscore DESC
        LIMIT ?
      `, [totalScore, playerId, nAfter]),
    ]);

    return {
      rank: pr.rank,
      player: mapRow({ ...pr, playerid: playerId }),
      before: before.map(mapRow),
      after: after.map(mapRow),
    };
  }

  // Source: PlayerAccount.java → getRankedPlayersTop(number)
  getPlayerTop(number: number): Promise<PlayerRankRowDto[]> {
    return this.dataSource.query<PlayerRankRowDto[]>(`
      SELECT
        pi.playerid                          AS playerId,
        pa.gamescore                         AS gameScore,
        pa.socialscore                       AS socialScore,
        pi.screenname                        AS screenName,
        pi.fbuid                             AS fbUid,
        p.accounttype                        AS accountType,
        UNIX_TIMESTAMP(p.endvipts)           AS endVipTs,
        p.subscription                       AS subscription
      FROM playeraccount pa
      JOIN playerinfos pi ON pi.playerid = pa.playerid
      JOIN player      p  ON p.playerid  = pa.playerid
      ORDER BY pa.gamescore + pa.socialscore DESC
      LIMIT ?
    `, [number]);
  }
}
