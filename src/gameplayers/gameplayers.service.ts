import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GamePlayerListDto, GamePlayerRowDto } from './dto/game-player.dto';

/**
 * Joueurs assis aux tables (gametableplayer), avec le pseudo (playerinfos) et le
 * nom/type/état de la table (gametable). Filtres : joueur, table, launchstate, gamestate.
 */
@Injectable()
export class GamePlayersService {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    player: string,
    table: string,
    launchState: number | undefined,
    gameState: number | undefined,
    seatedOnly: boolean,
    limit: number,
    offset: number,
  ): Promise<GamePlayerListDto> {
    const conds: string[] = [];
    const args: (string | number)[] = [];
    if (player) {
      conds.push('(pi.screenname LIKE ? OR gtp.playerid = ?)');
      args.push(`%${player}%`, /^\d+$/.test(player) ? Number(player) : -1);
    }
    if (table) {
      conds.push('(gt.label LIKE ? OR gt.gametableid = ?)');
      args.push(`%${table}%`, /^\d+$/.test(table) ? Number(table) : -1);
    }
    if (launchState != null) { conds.push('gt.launchstate = ?'); args.push(launchState); }
    if (gameState != null) { conds.push('gt.gamestate = ?'); args.push(gameState); }
    if (seatedOnly) conds.push('(gtp.endts = 0 OR gtp.endts IS NULL)'); // encore assis
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const join = `
      FROM gametableplayer gtp
      JOIN gametable gt ON gt.gametableid = gtp.gametableid
      LEFT JOIN playerinfos pi ON pi.playerid = gtp.playerid
      ${where}`;

    const items = await this.dataSource.query<GamePlayerRowDto[]>(
      `SELECT gtp.gametableplayerid AS gameTablePlayerId, gtp.playerid AS playerId, pi.screenname AS screenName,
              gtp.gametableid AS gameTableId, gt.label AS tableLabel, gt.tabletype AS tableType,
              gt.launchstate AS launchState, gt.gamestate AS gameState,
              gtp.seatno AS seatNo, gtp.stack AS stack,
              gtp.tableconnectionstate AS connectionState, gtp.ingamestate AS inGameState,
              gtp.endts AS endTs
       ${join}
       ORDER BY gtp.gametableplayerid DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total ${join}`, args,
    );
    return { items, total: totalRow[0]?.total ?? 0 };
  }
}
