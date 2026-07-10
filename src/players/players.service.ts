import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlayerDetailDto, PlayerListDto, PlayerRowDto } from './dto/player-row.dto';
import { DayCountDto } from './dto/day-count.dto';
import { BanType } from './dto/ban.dto';
import { BlacklistService } from './blacklist.service';

/** Type de compte manipulé par le backoffice (dérivé de accounttype). */
export type PlayerType = 'normal' | 'vip' | 'modo';

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

  async list(
    search: string,
    type: PlayerType | undefined,
    sortBy: 'solde' | 'cams' | undefined,
    sortDir: 'asc' | 'desc',
    limit: number,
    offset: number,
  ): Promise<PlayerListDto> {
    const like = `%${search}%`;
    const searchId = /^\d+$/.test(search) ? Number(search) : -1;
    const conds: string[] = [];
    const whereArgs: (string | number)[] = [];
    if (search) {
      conds.push('(pi.screenname LIKE ? OR pi.email LIKE ? OR p.playerid = ?)');
      whereArgs.push(like, like, searchId);
    }
    if (type === 'normal') conds.push('p.accounttype = 0');
    else if (type === 'vip') conds.push('p.accounttype = 1');
    else if (type === 'modo') conds.push('p.accounttype >= 2');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // ORDER BY sécurisé (whitelist) : défaut = plus récents.
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
    let orderBy = 'p.playerid DESC';
    if (sortBy === 'solde') orderBy = `(COALESCE(pa.amount, 0) + COALESCE(pa.amountbonus, 0)) ${dir}`;
    else if (sortBy === 'cams') orderBy = `COALESCE(pa.cams, 0) ${dir}`;

    const items = await this.dataSource.query<PlayerRowDto[]>(
      `
      SELECT p.playerid AS playerId, pi.screenname AS screenName, p.accounttype AS accountType,
             p.creationts AS creationTs, p.endvipts AS endVipTs, p.toremove AS toRemove,
             (COALESCE(pa.amount, 0) + COALESCE(pa.amountbonus, 0)) AS solde, COALESCE(pa.cams, 0) AS cams,
             EXISTS(SELECT 1 FROM blacklist b WHERE b.playerid = p.playerid) AS siteBanned
      FROM player p
      JOIN playerinfos pi ON pi.playerid = p.playerid
      LEFT JOIN playeraccount pa ON pa.playerid = p.playerid
      ${where}
      ORDER BY ${orderBy}
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
      it.solde = Number(it.solde);
      it.cams = Number(it.cams);
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
             pa.amount AS amount, pa.amountbonus AS amountBonus, COALESCE(pa.cams, 0) AS cams,
             EXISTS(SELECT 1 FROM blacklist b WHERE b.playerid = p.playerid)                                        AS siteBanned,
             EXISTS(SELECT 1 FROM bannedplayer bp WHERE bp.playerid = p.playerid AND (bp.endts = 0 OR bp.endts IS NULL)) AS chatBanned,
             EXISTS(SELECT 1 FROM bannedcamall bc WHERE bc.playerid = p.playerid AND (bc.endts = 0 OR bc.endts IS NULL)) AS camBanned
      FROM player p
      JOIN playerinfos pi ON pi.playerid = p.playerid
      LEFT JOIN playeraccount pa ON pa.playerid = p.playerid
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

  /** Nombre de connexions par jour d'un joueur (via ses sessions), sur `days` jours. */
  async connectionsPerDay(playerId: number, days: number): Promise<DayCountDto[]> {
    const span = days - 1; // validé côté contrôleur (7/30/90) → inline sûr
    const rows = await this.dataSource.query<DayCountDto[]>(
      `SELECT DATE_FORMAT(c.startts, '%Y-%m-%d') AS day, COUNT(*) AS count
       FROM connection c
       JOIN playersession ps ON ps.playersessionid = c.playersessionid
       WHERE ps.playerid = ? AND c.startts >= CURDATE() - INTERVAL ${span} DAY
       GROUP BY day ORDER BY day`,
      [playerId],
    );
    return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
  }

  /**
   * Change le type d'un joueur (accounttype). VIP exige une date de fin (endvipts).
   *  - normal → accounttype 0 ; modo → accounttype 2 ; vip → accounttype 1 + endvipts.
   */
  async setType(playerId: number, type: PlayerType, endVipTs?: string): Promise<void> {
    switch (type) {
      case 'normal':
        await this.dataSource.query('UPDATE player SET accounttype = 0 WHERE playerid = ?', [playerId]);
        return;
      case 'modo':
        await this.dataSource.query('UPDATE player SET accounttype = 2 WHERE playerid = ?', [playerId]);
        return;
      case 'vip':
        if (!endVipTs) throw new BadRequestException('Date de fin VIP requise');
        await this.dataSource.query(
          'UPDATE player SET accounttype = 1, endvipts = ? WHERE playerid = ?', [endVipTs, playerId]);
        return;
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
