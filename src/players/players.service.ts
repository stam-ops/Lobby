import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlayerListDto, PlayerRowDto } from './dto/player-row.dto';
import { BanType } from './dto/ban.dto';

/**
 * Liste des joueurs + actions de bannissement pour le backoffice.
 *
 * Tables (toutes dans maindb, cf. Bdd/.../BannedPlayer.java & BlackList.java) :
 *  - site : `blacklist` (colonne playerid, PAS de endts → pas de déban).
 *  - chat : `bannedplayer`, endts=0 = actif, moderatorid = auteur.
 *  - cam  : `bannedcamall`, endts=0 = actif, moderatorid = auteur.
 */
@Injectable()
export class PlayersService {
  constructor(private readonly dataSource: DataSource) {}

  async list(search: string, limit: number, offset: number): Promise<PlayerListDto> {
    const like = `%${search}%`;
    const searchId = /^\d+$/.test(search) ? Number(search) : -1;
    const where = search
      ? `WHERE pi.screenname LIKE ? OR pi.email LIKE ? OR pi.playerid = ?`
      : '';
    const whereArgs = search ? [like, like, searchId] : [];

    const items = await this.dataSource.query<PlayerRowDto[]>(
      `
      SELECT pi.playerid AS playerId, pi.screenname AS screenName, pi.email AS email,
             pi.firstname AS firstName, pi.lastname AS lastName,
             EXISTS(SELECT 1 FROM blacklist b WHERE b.playerid = pi.playerid)                               AS siteBanned,
             EXISTS(SELECT 1 FROM bannedplayer bp WHERE bp.playerid = pi.playerid AND bp.endts = 0)         AS chatBanned,
             EXISTS(SELECT 1 FROM bannedcamall bc WHERE bc.playerid = pi.playerid AND bc.endts = 0)         AS camBanned
      FROM playerinfos pi
      ${where}
      ORDER BY pi.playerid DESC
      LIMIT ? OFFSET ?
      `,
      [...whereArgs, limit, offset],
    );

    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM playerinfos pi ${where}`,
      whereArgs,
    );

    // MySQL renvoie les EXISTS en 0/1 → normaliser en boolean.
    for (const it of items) {
      it.siteBanned = !!it.siteBanned;
      it.chatBanned = !!it.chatBanned;
      it.camBanned = !!it.camBanned;
    }

    return { items, total: totalRow[0]?.total ?? 0 };
  }

  /** Applique un ban. Idempotent (no-op si déjà actif). moderatorId = backofficeuserid. */
  async ban(playerId: number, type: BanType, moderatorId: number): Promise<void> {
    switch (type) {
      case 'site': {
        const exists = await this.dataSource.query(
          `SELECT 1 FROM blacklist WHERE playerid = ? LIMIT 1`, [playerId]);
        if (!exists.length) {
          await this.dataSource.query(
            `INSERT INTO blacklist (playerid) VALUES (?)`, [playerId]);
        }
        return;
      }
      case 'chat': {
        const active = await this.dataSource.query(
          `SELECT 1 FROM bannedplayer WHERE playerid = ? AND endts = 0 LIMIT 1`, [playerId]);
        if (!active.length) {
          await this.dataSource.query(
            `INSERT INTO bannedplayer (playerid, moderatorid) VALUES (?, ?)`, [playerId, moderatorId]);
        }
        return;
      }
      case 'cam': {
        const active = await this.dataSource.query(
          `SELECT 1 FROM bannedcamall WHERE playerid = ? AND endts = 0 LIMIT 1`, [playerId]);
        if (!active.length) {
          await this.dataSource.query(
            `INSERT INTO bannedcamall (playerid, moderatorid) VALUES (?, ?)`, [playerId, moderatorId]);
        }
        return;
      }
    }
  }

  /** Lève un ban chat/cam (endts). Le ban site (blacklist) n'a pas de endts → non supporté. */
  async unban(playerId: number, type: BanType): Promise<void> {
    switch (type) {
      case 'chat':
        await this.dataSource.query(
          `UPDATE bannedplayer SET endts = CURRENT_TIMESTAMP WHERE playerid = ? AND endts = 0`, [playerId]);
        return;
      case 'cam':
        await this.dataSource.query(
          `UPDATE bannedcamall SET endts = CURRENT_TIMESTAMP WHERE playerid = ? AND endts = 0`, [playerId]);
        return;
      case 'site':
        throw new BadRequestException('Le déban site (blacklist) n\'est pas supporté (table sans endts).');
    }
  }
}
