import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Backoffice des bots poker : parametres globaux (botparameters), pool de comptes (botaccount) et
 * provisionnement des soldes (playeraccount : P + Cam's). maindb, requetes brutes (colonnes
 * whitelistees → pas d'injection). Cf. migration-bots.sql.
 */

// Colonnes editables de botparameters (whitelist) + lesquelles sont des flags 0/1.
const PARAM_COLS = [
  'enabled', 'camblitzbotsenabled', 'hubotsenabled', 'cashenabled',
  'botfilldelayms', 'cashhandoffthreshold', 'sngseedbots', 'maxonlineforbots',
];
const FLAG_COLS = new Set(['enabled', 'camblitzbotsenabled', 'hubotsenabled', 'cashenabled']);

@Injectable()
export class BotsService {
  constructor(private readonly ds: DataSource) {}

  async getParameters(): Promise<Record<string, number>> {
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `SELECT ${PARAM_COLS.join(', ')} FROM botparameters LIMIT 1`,
    );
    if (!rows.length) throw new NotFoundException('botparameters vide — appliquer migration-bots.sql');
    const out: Record<string, number> = {};
    for (const c of PARAM_COLS) out[c] = Number(rows[0][c]);
    return out;
  }

  async updateParameters(patch: Record<string, unknown>): Promise<Record<string, number>> {
    const sets: string[] = [];
    const args: number[] = [];
    for (const [k, raw] of Object.entries(patch ?? {})) {
      if (!PARAM_COLS.includes(k)) throw new BadRequestException(`Colonne non editable : ${k}`);
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new BadRequestException(`${k} doit etre un entier`);
      if (FLAG_COLS.has(k) && n !== 0 && n !== 1) throw new BadRequestException(`${k} est un flag : 0 (off) ou 1 (on)`);
      // botfilldelayms / cashhandoffthreshold >= 0 ; sngseedbots / maxonlineforbots acceptent -1 (auto / pas de plafond).
      if (!FLAG_COLS.has(k) && n < -1) throw new BadRequestException(`${k} invalide`);
      sets.push(`${k} = ?`);
      args.push(n);
    }
    if (!sets.length) throw new BadRequestException('Aucune valeur a mettre a jour');
    await this.ds.query(`UPDATE botparameters SET ${sets.join(', ')} LIMIT 1`, args);
    return this.getParameters();
  }

  async listAccounts(): Promise<unknown[]> {
    return this.ds.query(
      `SELECT ba.playerid AS id, ba.playerid AS playerId, ba.sex AS sex, ba.active AS active, ba.level AS level,
              COALESCE(pa.amount, 0) AS amount, COALESCE(pa.cams, 0) AS cams, pi.screenname AS screenName
         FROM botaccount ba
         LEFT JOIN playeraccount pa ON pa.playerid = ba.playerid
         LEFT JOIN playerinfos   pi ON pi.playerid = ba.playerid
        ORDER BY ba.playerid`,
    );
  }

  async addAccount(playerId: number, sex: number, level: number): Promise<unknown[]> {
    if (!Number.isInteger(playerId) || playerId <= 0) throw new BadRequestException('playerId invalide');
    const sx = sex === 1 ? 1 : 0;
    const lvl = level === 0 || level === 2 ? level : 1; // 0=facile 1=intermediaire 2=fort
    const exists = await this.ds.query(`SELECT 1 FROM botaccount WHERE playerid = ? LIMIT 1`, [playerId]);
    if (exists.length) throw new BadRequestException('Compte bot deja dans le pool');
    const pa = await this.ds.query(`SELECT 1 FROM playeraccount WHERE playerid = ? LIMIT 1`, [playerId]);
    if (!pa.length) throw new BadRequestException('playerid inconnu (aucun compte joueur)');
    await this.ds.query(`INSERT INTO botaccount (playerid, sex, active, level) VALUES (?, ?, 1, ?)`, [playerId, sx, lvl]);
    return this.listAccounts();
  }

  async updateAccount(playerId: number, sex?: number, active?: number, level?: number): Promise<unknown[]> {
    const sets: string[] = [];
    const args: number[] = [];
    if (sex !== undefined && sex !== null) { sets.push('sex = ?'); args.push(Number(sex) === 1 ? 1 : 0); }
    if (active !== undefined && active !== null) { sets.push('active = ?'); args.push(Number(active) ? 1 : 0); }
    if (level !== undefined && level !== null) {
      const l = Number(level);
      sets.push('level = ?');
      args.push(l === 0 || l === 2 ? l : 1);
    }
    if (!sets.length) throw new BadRequestException('Rien a mettre a jour');
    args.push(playerId);
    await this.ds.query(`UPDATE botaccount SET ${sets.join(', ')} WHERE playerid = ?`, args);
    return this.listAccounts();
  }

  async deleteAccount(playerId: number): Promise<{ ok: boolean }> {
    await this.ds.query(`DELETE FROM botaccount WHERE playerid = ?`, [playerId]);
    return { ok: true };
  }

  /** Provisionne (ou retire si negatif) P et/ou Cam's sur le compte du bot. */
  async topup(playerId: number, amount: number, cams: number): Promise<unknown[]> {
    const exists = await this.ds.query(`SELECT 1 FROM botaccount WHERE playerid = ? LIMIT 1`, [playerId]);
    if (!exists.length) throw new NotFoundException('Compte bot introuvable');
    await this.ds.transaction(async (em) => {
      if (amount) await em.query(`UPDATE playeraccount SET amount = amount + ? WHERE playerid = ?`, [Math.trunc(amount), playerId]);
      if (cams) await em.query(`UPDATE playeraccount SET cams = cams + ? WHERE playerid = ?`, [Math.trunc(cams), playerId]);
    });
    return this.listAccounts();
  }
}
