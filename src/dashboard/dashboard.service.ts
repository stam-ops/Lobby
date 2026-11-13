import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { chanceTable } from '../chance/chance-db';
import { webVipCentsSql } from '../chance/vip-web.service';
import { DashboardDto, DayCountDto, MonthCountDto } from './dto/dashboard.dto';

/**
 * Métriques du tableau de bord.
 *  - totalPlayers : joueurs inscrits (non supprimés).
 *  - vipPlayers   : VIP actifs (endvipts dans le futur).
 *  - onlinePlayers: joueurs connectés (session ouverte, endts = 0).
 *  - activePerDay : joueurs distincts ayant ouvert une session, par jour (30 j).
 *  - newPerDay    : nouveaux joueurs (creationts), par jour (30 j).
 *  - chanceUsers  : comptes du Chance-o-mètre (base `chance`).
 *  - chanceAnalyseMonthCents : paiements de l'offre Analyse du mois en cours (chancepayment ; le VIP vendu sur le
 *    Chance-o-mètre est déjà dans monthRevenueCents, via paymentpoker).
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger('Dashboard');
  private readonly chanceUsersT: string;
  private readonly chancePaymentsT: string;

  constructor(private readonly dataSource: DataSource, config: ConfigService) {
    this.chanceUsersT = chanceTable(config, 'chanceuser');
    this.chancePaymentsT = chanceTable(config, 'chancepayment');
  }

  /** Chiffres du Chance-o-mètre ; base ou tables absentes (sql/002, sql/004 pas passés) : 0. */
  private async chance(): Promise<{ chanceUsers: number; chanceAnalyseMonthCents: number }> {
    const one = async (sql: string) => {
      try { return Number((await this.dataSource.query<{ n: number | string | null }[]>(sql))[0]?.n ?? 0); }
      catch (e) { this.logger.warn(`Chance-o-mètre : ${(e as Error).message}`); return 0; }
    };
    const [chanceUsers, chanceAnalyseMonthCents] = await Promise.all([
      one(`SELECT COUNT(*) AS n FROM ${this.chanceUsersT}`),
      one(`SELECT COALESCE(SUM(cents), 0) AS n FROM ${this.chancePaymentsT}
            WHERE product = 'analyse' AND creationts >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`),
    ]);
    return { chanceUsers, chanceAnalyseMonthCents };
  }

  async data(days: number): Promise<DashboardDto> {
    // `days` est validé (7/30/90) côté contrôleur → inline sûr (entier).
    const span = days - 1;

    const metrics = await this.dataSource.query<
      { totalPlayers: number; vipPlayers: number; onlinePlayers: number; monthRevenueCents: number }[]
    >(`
      SELECT
        (SELECT COUNT(*) FROM player WHERE toremove = 0) AS totalPlayers,
        (SELECT COUNT(*) FROM player WHERE toremove = 0 AND accounttype = 1) AS vipPlayers,
        (SELECT COUNT(DISTINCT playerid) FROM playersession WHERE opened = 1 AND endts = 0) AS onlinePlayers,
        (SELECT COALESCE(SUM(
           COALESCE((SELECT o.pricecents FROM offer o WHERE o.productid = pp.productid AND o.producttype = pp.producttype LIMIT 1),
             ${webVipCentsSql('pp.productid')})
         ), 0)
         FROM paymentpoker pp
         WHERE pp.validated = 1 AND pp.ts >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS monthRevenueCents
    `);

    const activePerDay = await this.dataSource.query<DayCountDto[]>(`
      SELECT DATE_FORMAT(startts, '%Y-%m-%d') AS day, COUNT(DISTINCT playerid) AS count
      FROM playersession
      WHERE startts >= CURDATE() - INTERVAL ${span} DAY
      GROUP BY day ORDER BY day
    `);

    const newPerDay = await this.dataSource.query<DayCountDto[]>(`
      SELECT DATE_FORMAT(creationts, '%Y-%m-%d') AS day, COUNT(*) AS count
      FROM player
      WHERE toremove = 0 AND creationts >= CURDATE() - INTERVAL ${span} DAY
      GROUP BY day ORDER BY day
    `);

    const ch = await this.chance();
    const m = metrics[0] ?? { totalPlayers: 0, vipPlayers: 0, onlinePlayers: 0, monthRevenueCents: 0 };
    const num = (rows: DayCountDto[]) => rows.map((r) => ({ day: r.day, count: Number(r.count) }));

    return {
      totalPlayers: Number(m.totalPlayers),
      vipPlayers: Number(m.vipPlayers),
      onlinePlayers: Number(m.onlinePlayers),
      monthRevenueCents: Number(m.monthRevenueCents),
      chanceUsers: ch.chanceUsers,
      chanceAnalyseMonthCents: ch.chanceAnalyseMonthCents,
      activePerDay: num(activePerDay),
      newPerDay: num(newPerDay),
    };
  }

  /** Monthly Active Users : joueurs distincts avec une session par mois, sur `months` mois. */
  async mau(months: number): Promise<MonthCountDto[]> {
    const span = months - 1; // validé côté contrôleur (6/12/24) → inline sûr
    const rows = await this.dataSource.query<MonthCountDto[]>(`
      SELECT DATE_FORMAT(startts, '%Y-%m') AS month, COUNT(DISTINCT playerid) AS count
      FROM playersession
      WHERE startts >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ${span} MONTH)
      GROUP BY month ORDER BY month
    `);
    return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
  }
}
