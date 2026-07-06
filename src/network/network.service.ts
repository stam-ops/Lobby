import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ConnectionListDto, ConnectionRowDto, SessionDetailDto, SessionListDto, SessionRowDto,
} from './dto/network.dto';

const toBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || Number(v) === 1;

/**
 * Sessions joueur (`playersession`) et connexions (`connection`) pour le backoffice.
 *  - Session active = opened = 1 ET endts = 0 (ouverte + connectée).
 *  - Connexion ouverte = endts = 0.
 *  - ipBlacklisted : l'IP (int) figure dans `blacklist`. Le ban/déban passe par /admin/blacklist.
 */
@Injectable()
export class NetworkService {
  constructor(private readonly dataSource: DataSource) {}

  private readonly SESSION_COLS = `
    ps.playersessionid AS playerSessionId, ps.playerid AS playerId, pi.screenname AS screenName,
    ps.startts AS startTs, ps.endts AS endTs, ps.opened AS opened,
    ps.ip AS ip, INET_NTOA(ps.ip & 4294967295) AS ipStr,
    EXISTS(SELECT 1 FROM blacklist b WHERE b.ip = ps.ip) AS ipBlacklisted`;

  private readonly CONN_COLS = `
    c.connectionid AS connectionId, c.ip AS ip, INET_NTOA(c.ip & 4294967295) AS ipStr,
    c.websocketid AS websocketId, c.frontid AS frontId, c.playersessionid AS playerSessionId,
    c.startts AS startTs, c.endts AS endTs, c.endstate AS endState,
    EXISTS(SELECT 1 FROM blacklist b WHERE b.ip = c.ip) AS ipBlacklisted`;

  private normSession(r: SessionRowDto) {
    r.opened = toBool(r.opened);
    r.ipBlacklisted = toBool(r.ipBlacklisted);
    return r;
  }
  private normConn(r: ConnectionRowDto) {
    r.ipBlacklisted = toBool(r.ipBlacklisted);
    return r;
  }

  async sessions(active: boolean | undefined, limit: number, offset: number): Promise<SessionListDto> {
    let where = '';
    if (active === true) where = 'WHERE ps.opened = 1 AND ps.endts = 0';
    else if (active === false) where = 'WHERE NOT (ps.opened = 1 AND ps.endts = 0)';

    const items = await this.dataSource.query<SessionRowDto[]>(
      `SELECT ${this.SESSION_COLS}
       FROM playersession ps
       LEFT JOIN playerinfos pi ON pi.playerid = ps.playerid
       ${where}
       ORDER BY ps.playersessionid DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM playersession ps ${where}`,
    );
    items.forEach((r) => this.normSession(r));
    return { items, total: totalRow[0]?.total ?? 0 };
  }

  async session(id: number): Promise<SessionDetailDto> {
    const rows = await this.dataSource.query<SessionRowDto[]>(
      `SELECT ${this.SESSION_COLS}
       FROM playersession ps
       LEFT JOIN playerinfos pi ON pi.playerid = ps.playerid
       WHERE ps.playersessionid = ?`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`Session ${id} introuvable`);
    const connections = await this.dataSource.query<ConnectionRowDto[]>(
      `SELECT ${this.CONN_COLS} FROM connection c WHERE c.playersessionid = ? ORDER BY c.connectionid DESC`,
      [id],
    );
    connections.forEach((r) => this.normConn(r));
    return { ...this.normSession(rows[0]), connections };
  }

  async connections(
    open: boolean | undefined,
    session: 'with' | 'without' | undefined,
    limit: number,
    offset: number,
  ): Promise<ConnectionListDto> {
    const conds: string[] = [];
    if (open === true) conds.push('c.endts = 0');
    if (session === 'with') conds.push('c.playersessionid IS NOT NULL');
    else if (session === 'without') conds.push('c.playersessionid IS NULL');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const items = await this.dataSource.query<ConnectionRowDto[]>(
      `SELECT ${this.CONN_COLS}
       FROM connection c
       ${where}
       ORDER BY c.connectionid DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM connection c ${where}`,
    );
    items.forEach((r) => this.normConn(r));
    return { items, total: totalRow[0]?.total ?? 0 };
  }
}
