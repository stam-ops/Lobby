import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlayerDetailDto, PlayerListDto, PlayerRowDto } from './dto/player-row.dto';
import { BanType } from './dto/ban.dto';
import { BlacklistService } from './blacklist.service';

/**
 * Conversion robuste vers boolean. mysql2 peut renvoyer un EXISTS/tinyint sous forme de nombre
 * (0/1) OU de chaîne ("0"/"1") selon les cas → `!!"0"` vaudrait `true` (piège). On teste la valeur.
 */
const toBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || Number(v) === 1;

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
  constructor(
    private readonly dataSource: DataSource,
    private readonly blacklist: BlacklistService,
  ) {}

  async list(search: string, limit: number, offset: number): Promise<PlayerListDto> {
    const like = `%${search}%`;
    const searchId = /^\d+$/.test(search) ? Number(search) : -1;
    const where = search
      ? `WHERE pi.screenname LIKE ? OR pi.email LIKE ? OR p.playerid = ?`
      : '';
    const whereArgs = search ? [like, like, searchId] : [];

    const items = await this.dataSource.query<PlayerRowDto[]>(
      `
      SELECT p.playerid AS playerId, pi.screenname AS screenName, p.accounttype AS accountType,
             p.creationts AS creationTs, p.endvipts AS endVipTs, p.toremove AS toRemove,
             EXISTS(SELECT 1 FROM blacklist b WHERE b.playerid = p.playerid) AS siteBanned
      FROM player p
      JOIN playerinfos pi ON pi.playerid = p.playerid
      ${where}
      ORDER BY p.playerid DESC
      LIMIT ? OFFSET ?
      `,
      [...whereArgs, limit, offset],
    );

    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM player p JOIN playerinfos pi ON pi.playerid = p.playerid ${where}`,
      whereArgs,
    );

    // MySQL renvoie EXISTS/tinyint en 0/1 (nombre OU chaîne) → conversion robuste.
    for (const it of items) {
      it.siteBanned = toBool(it.siteBanned);
      it.toRemove = toBool(it.toRemove);
    }

    return { items, total: totalRow[0]?.total ?? 0 };
  }

  async detail(playerId: number): Promise<PlayerDetailDto> {
    const rows = await this.dataSource.query<PlayerDetailDto[]>(
      `
      SELECT p.playerid AS playerId, pi.screenname AS screenName, p.accounttype AS accountType,
             p.creationts AS creationTs, p.endvipts AS endVipTs, p.toremove AS toRemove,
             pi.email AS email, pi.firstname AS firstName, pi.lastname AS lastName,
             pi.sex AS sex, pi.birthdate AS birthdate, pi.signinmethod AS signInMethod,
             pi.fbuid AS fbUid, pi.os AS os, pi.langid AS langId,
             pi.tokenfb AS tokenFb, pi.tokenios AS tokenIos,
             pi.lastrate AS lastRate, pi.lastopinion AS lastOpinion,
             pi.notifgeneral AS notifGeneral, pi.notifperso AS notifPerso,
             EXISTS(SELECT 1 FROM blacklist b WHERE b.playerid = p.playerid)                                        AS siteBanned,
             EXISTS(SELECT 1 FROM bannedplayer bp WHERE bp.playerid = p.playerid AND (bp.endts = 0 OR bp.endts IS NULL)) AS chatBanned,
             EXISTS(SELECT 1 FROM bannedcamall bc WHERE bc.playerid = p.playerid AND (bc.endts = 0 OR bc.endts IS NULL)) AS camBanned
      FROM player p
      JOIN playerinfos pi ON pi.playerid = p.playerid
      WHERE p.playerid = ?
      `,
      [playerId],
    );
    if (!rows.length) throw new NotFoundException(`Joueur ${playerId} introuvable`);
    const r = rows[0];
    r.toRemove = toBool(r.toRemove);
    r.siteBanned = toBool(r.siteBanned);
    r.chatBanned = toBool(r.chatBanned);
    r.camBanned = toBool(r.camBanned);
    return r;
  }

  /** Applique un ban. Idempotent (no-op si déjà actif). moderatorId = backofficeuserid. */
  async ban(playerId: number, type: BanType, moderatorId: number): Promise<void> {
    switch (type) {
      case 'site':
        // Ban site = entrée blacklist sur le playerid (délégué au propriétaire de la table).
        await this.blacklist.add({ playerId });
        return;
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

  /** Lève un ban. chat/cam → endts ; site → suppression de l'entrée blacklist du joueur. */
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
        await this.blacklist.remove({ playerId });
        return;
    }
  }
}
