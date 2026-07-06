import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TableListDto, TableRowDto } from './dto/table.dto';

export type TableTypeFilter = 'camdate' | 'camblitz' | 'cashgame' | 'private' | 'tournament';

/**
 * Tables (gametable) pour le backoffice.
 *
 * Type déduit de l'archetype (gametablearchetype.type = ArchetypeType) + tournamentid :
 *   tournamentid>0 → Tournoi ; sinon gta.type : 1=CamDate, 2=CamBlitz, 3=CashGame, 4=CashGame privée.
 * Jointure playerinfos sur ownerplayerid → screenName du propriétaire (cash game privée).
 */
@Injectable()
export class TablesService {
  constructor(private readonly dataSource: DataSource) {}

  private readonly TYPE_COND: Record<TableTypeFilter, string> = {
    tournament: 'gt.tournamentid IS NOT NULL AND gt.tournamentid > 0',
    camdate: 'gta.type = 1 AND COALESCE(gt.tournamentid, 0) = 0',
    camblitz: 'gta.type = 2 AND COALESCE(gt.tournamentid, 0) = 0',
    cashgame: 'gta.type = 3 AND COALESCE(gt.tournamentid, 0) = 0',
    private: 'gta.type = 4 AND COALESCE(gt.tournamentid, 0) = 0',
  };

  async list(
    type: TableTypeFilter | undefined,
    launchState: number | undefined,
    gameState: number | undefined,
    limit: number,
    offset: number,
  ): Promise<TableListDto> {
    const conds: string[] = [];
    const args: number[] = [];
    if (type && this.TYPE_COND[type]) conds.push(`(${this.TYPE_COND[type]})`);
    if (launchState != null) { conds.push('gt.launchstate = ?'); args.push(launchState); }
    if (gameState != null) { conds.push('gt.gamestate = ?'); args.push(gameState); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const items = await this.dataSource.query<TableRowDto[]>(
      `
      SELECT gt.gametableid AS gameTableId, gt.label AS label,
             gt.launchstate AS launchState, gt.gamestate AS gameState, gt.playerscount AS playersCount,
             gt.gametablearchetypeid AS gameTableArchetypeId, gta.type AS archetypeType,
             gt.tournamentid AS tournamentId,
             gt.camserverip AS camServerIp, INET_NTOA(gt.camserverip & 4294967295) AS camServerIpStr,
             gt.ownerplayerid AS ownerPlayerId, pi.screenname AS ownerScreenName
      FROM gametable gt
      LEFT JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
      LEFT JOIN playerinfos pi ON pi.playerid = gt.ownerplayerid
      ${where}
      ORDER BY gt.gametableid DESC
      LIMIT ? OFFSET ?
      `,
      [...args, limit, offset],
    );

    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total
       FROM gametable gt
       LEFT JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
       ${where}`,
      args,
    );

    return { items, total: totalRow[0]?.total ?? 0 };
  }
}
