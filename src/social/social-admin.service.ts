import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CampokeListDto, CampokeRowDto, FriendRelationListDto, FriendRelationRowDto,
} from './dto/campoke.dto';

/**
 * Vues backoffice sur le social : campokes envoyés (table `campoke`) et relations d'amitié
 * (`friendrelation`). Double jointure playerinfos pour résoudre l'émetteur ET le destinataire.
 */
@Injectable()
export class SocialAdminService {
  constructor(private readonly dataSource: DataSource) {}

  /** Filtre commun : recherche sur l'un OU l'autre des deux joueurs (pseudo ou id). */
  private playerCond(search: string, args: (string | number)[]): string | null {
    if (!search) return null;
    const like = `%${search}%`;
    const id = /^\d+$/.test(search) ? Number(search) : -1;
    args.push(like, id, like, id);
    return '(pf.screenname LIKE ? OR c.playeridfrom = ? OR pt.screenname LIKE ? OR c.playeridto = ?)';
  }

  async campokes(search: string, type: number | undefined, limit: number, offset: number): Promise<CampokeListDto> {
    const conds: string[] = [];
    const args: (string | number)[] = [];
    const pc = this.playerCond(search, args);
    if (pc) conds.push(pc);
    if (type != null) { conds.push('c.invitationtype = ?'); args.push(type); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const join = `
      FROM campoke c
      LEFT JOIN playerinfos pf ON pf.playerid = c.playeridfrom
      LEFT JOIN playerinfos pt ON pt.playerid = c.playeridto
      ${where}`;

    const items = await this.dataSource.query<CampokeRowDto[]>(
      `SELECT c.campokeid AS campokeId,
              c.playeridfrom AS playerIdFrom, pf.screenname AS screenNameFrom,
              c.playeridto AS playerIdTo, pt.screenname AS screenNameTo,
              c.invitationtype AS invitationType, c.message AS message,
              c.tournamentid AS tournamentId, c.gametableid AS gameTableId
       ${join}
       ORDER BY c.campokeid DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(`SELECT COUNT(*) AS total ${join}`, args);
    return { items, total: totalRow[0]?.total ?? 0 };
  }

  async friendRelations(search: string, state: number | undefined, limit: number, offset: number): Promise<FriendRelationListDto> {
    const conds: string[] = [];
    const args: (string | number)[] = [];
    // Même forme que playerCond mais sur l'alias `c` = friendrelation (colonnes identiques).
    const pc = this.playerCond(search, args);
    if (pc) conds.push(pc);
    if (state != null) { conds.push('c.friendrelationstate = ?'); args.push(state); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const join = `
      FROM friendrelation c
      LEFT JOIN playerinfos pf ON pf.playerid = c.playeridfrom
      LEFT JOIN playerinfos pt ON pt.playerid = c.playeridto
      ${where}`;

    const items = await this.dataSource.query<FriendRelationRowDto[]>(
      `SELECT c.friendrelationid AS friendRelationId,
              c.playeridfrom AS playerIdFrom, pf.screenname AS screenNameFrom,
              c.playeridto AS playerIdTo, pt.screenname AS screenNameTo,
              c.friendrelationstate AS state
       ${join}
       ORDER BY c.friendrelationid DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(`SELECT COUNT(*) AS total ${join}`, args);
    return { items, total: totalRow[0]?.total ?? 0 };
  }
}
