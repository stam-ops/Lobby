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

  // Cash game public = tabletype 0 sans owner (inclut type 0 classic ET type 3 publicCG).
  // Cash game privée = ownerplayerid renseigné. CamDate/CamBlitz = SNG type 1/2.
  private readonly TYPE_COND: Record<TableTypeFilter, string> = {
    tournament: 'gt.tournamentid IS NOT NULL AND gt.tournamentid > 0',
    private: 'gt.ownerplayerid IS NOT NULL AND COALESCE(gt.tournamentid, 0) = 0',
    cashgame: 'gt.tabletype = 0 AND gt.ownerplayerid IS NULL AND COALESCE(gt.tournamentid, 0) = 0',
    camdate: 'gta.type = 1 AND gt.ownerplayerid IS NULL AND COALESCE(gt.tournamentid, 0) = 0',
    camblitz: 'gta.type = 2 AND gt.ownerplayerid IS NULL AND COALESCE(gt.tournamentid, 0) = 0',
  };

  async list(
    type: TableTypeFilter | undefined,
    archetypeId: number | undefined,
    tournamentId: number | undefined,
    launchState: number | undefined,
    gameState: number | undefined,
    limit: number,
    offset: number,
  ): Promise<TableListDto> {
    const conds: string[] = [];
    const args: number[] = [];
    if (type && this.TYPE_COND[type]) conds.push(`(${this.TYPE_COND[type]})`);
    if (archetypeId != null) { conds.push('gt.gametablearchetypeid = ?'); args.push(archetypeId); }
    if (tournamentId != null) { conds.push('gt.tournamentid = ?'); args.push(tournamentId); }
    if (launchState != null) { conds.push('gt.launchstate = ?'); args.push(launchState); }
    if (gameState != null) { conds.push('gt.gamestate = ?'); args.push(gameState); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const items = await this.dataSource.query<TableRowDto[]>(
      `
      SELECT gt.gametableid AS gameTableId, gt.label AS label, gt.tabletype AS tableType,
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

  /** Clôture une table : launchstate = closed (3), gamestate = ended (3). */
  async close(gameTableId: number): Promise<void> {
    await this.dataSource.query(
      'UPDATE gametable SET launchstate = 3, gamestate = 3 WHERE gametableid = ?',
      [gameTableId],
    );
  }
}
