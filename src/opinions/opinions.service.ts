import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OpinionListDto, OpinionRowDto } from './dto/opinion.dto';

/**
 * Avis internes des joueurs (table playeropinion).
 * Notes : note1=Global, note2=Design, note3=Simplicité, note4=Expérience de jeu.
 */
@Injectable()
export class OpinionsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(search: string, limit: number, offset: number): Promise<OpinionListDto> {
    const like = `%${search}%`;
    const searchId = /^\d+$/.test(search) ? Number(search) : -1;
    const where = search
      ? 'WHERE pi.screenname LIKE ? OR po.playerid = ?'
      : '';
    const whereArgs = search ? [like, searchId] : [];

    const items = await this.dataSource.query<OpinionRowDto[]>(
      `SELECT po.playeropinionid AS playerOpinionId, po.playerid AS playerId,
              pi.screenname AS screenName, po.creationts AS creationTs, po.textfree AS textFree,
              po.note1 AS noteGlobal, po.note2 AS noteDesign, po.note3 AS noteSimplicity, po.note4 AS noteGameplay
       FROM playeropinion po
       LEFT JOIN playerinfos pi ON pi.playerid = po.playerid
       ${where}
       ORDER BY po.playeropinionid DESC
       LIMIT ? OFFSET ?`,
      [...whereArgs, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM playeropinion po
       LEFT JOIN playerinfos pi ON pi.playerid = po.playerid ${where}`,
      whereArgs,
    );
    return { items, total: totalRow[0]?.total ?? 0 };
  }
}
