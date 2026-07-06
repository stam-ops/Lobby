import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardDto, DayCountDto } from './dto/dashboard.dto';

/**
 * Métriques du tableau de bord.
 *  - totalPlayers : joueurs inscrits (non supprimés).
 *  - vipPlayers   : VIP actifs (endvipts dans le futur).
 *  - onlinePlayers: joueurs connectés (session ouverte, endts = 0).
 *  - activePerDay : joueurs distincts ayant ouvert une session, par jour (30 j).
 *  - newPerDay    : nouveaux joueurs (creationts), par jour (30 j).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async data(days: number): Promise<DashboardDto> {
    // `days` est validé (7/30/90) côté contrôleur → inline sûr (entier).
    const span = days - 1;

    const metrics = await this.dataSource.query<{ totalPlayers: number; vipPlayers: number; onlinePlayers: number }[]>(`
      SELECT
        (SELECT COUNT(*) FROM player WHERE toremove = 0) AS totalPlayers,
        (SELECT COUNT(*) FROM player WHERE toremove = 0 AND endvipts > NOW()) AS vipPlayers,
        (SELECT COUNT(DISTINCT playerid) FROM playersession WHERE opened = 1 AND endts = 0) AS onlinePlayers
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

    const m = metrics[0] ?? { totalPlayers: 0, vipPlayers: 0, onlinePlayers: 0 };
    const num = (rows: DayCountDto[]) => rows.map((r) => ({ day: r.day, count: Number(r.count) }));

    return {
      totalPlayers: Number(m.totalPlayers),
      vipPlayers: Number(m.vipPlayers),
      onlinePlayers: Number(m.onlinePlayers),
      activePerDay: num(activePerDay),
      newPerDay: num(newPerDay),
    };
  }
}
