import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface BannedWordRow {
  bannedWordId: number;
  word: string;
  lang: string;
  enabled: boolean;
  creationTs: string;
}

/**
 * Modération du tchat : table `bannedword` (cf. Bdd/.../BannedWord.java).
 *
 * - Le TableServer garde la liste en CACHE ~5 min (RELOAD_MS) : un ajout/retrait devient effectif
 *   tout seul, sans redémarrage.
 * - La base stocke le MOT, jamais une regex : BannedWord compile chaque mot en regex (tolérance
 *   accents/leet/répétitions) avec des bornes de mot obligatoires. On refuse donc tout ce qui
 *   ressemble à une regex ou contient des espaces.
 * - Le matching lit `WHERE enabled = 1` SANS filtrer sur `lang` : la langue est organisationnelle.
 */
@Injectable()
export class ModerationService {
  private static readonly MAX_WORD_LEN = 64;

  constructor(private readonly dataSource: DataSource) {}

  private normalizeWord(raw: unknown): string {
    const w = String(raw ?? '').trim().toLowerCase();
    if (!w) throw new BadRequestException('Mot requis');
    if (w.length > ModerationService.MAX_WORD_LEN) {
      throw new BadRequestException(`Mot trop long (max ${ModerationService.MAX_WORD_LEN})`);
    }
    if (/\s/.test(w)) throw new BadRequestException('Le mot ne doit pas contenir d\'espace');
    // Un mot, pas un motif : les métacaractères casseraient la regex compilée côté TableServer.
    if (/[\\^$.|?*+()\[\]{}]/.test(w)) {
      throw new BadRequestException('Caractères spéciaux interdits : saisir un mot simple, pas une expression régulière');
    }
    return w;
  }

  private normalizeLang(raw: unknown): string {
    const l = String(raw ?? '').trim().toLowerCase();
    if (!l) throw new BadRequestException('Langue requise');
    // '*' = toutes langues ; sinon code court type 'fr', 'en'.
    if (l !== '*' && !/^[a-z]{2,5}$/.test(l)) {
      throw new BadRequestException('Langue invalide : « * » ou un code type « fr », « en »');
    }
    return l;
  }

  async list(): Promise<BannedWordRow[]> {
    const rows = await this.dataSource.query<BannedWordRow[]>(`
      SELECT bannedwordid AS bannedWordId, word, lang, enabled, creationts AS creationTs
      FROM bannedword
      ORDER BY lang, word
    `);
    rows.forEach((r) => { r.enabled = Number(r.enabled) === 1; });
    return rows;
  }

  async add(word: unknown, lang: unknown): Promise<BannedWordRow[]> {
    const w = this.normalizeWord(word);
    const l = this.normalizeLang(lang);
    const dup = await this.dataSource.query(
      'SELECT 1 FROM bannedword WHERE word = ? AND lang = ? LIMIT 1', [w, l],
    );
    if (dup.length) throw new BadRequestException(`« ${w} » existe déjà pour la langue « ${l} »`);

    await this.dataSource.query(
      'INSERT INTO bannedword (word, lang, enabled) VALUES (?, ?, 1)', [w, l],
    );
    return this.list();
  }

  /** Modifie le mot, la langue et/ou l'activation. */
  async update(id: number, patch: { word?: unknown; lang?: unknown; enabled?: unknown }): Promise<BannedWordRow[]> {
    const sets: string[] = [];
    const args: (string | number)[] = [];

    if (patch.word !== undefined) { sets.push('word = ?'); args.push(this.normalizeWord(patch.word)); }
    if (patch.lang !== undefined) { sets.push('lang = ?'); args.push(this.normalizeLang(patch.lang)); }
    if (patch.enabled !== undefined) {
      const e = patch.enabled === true || patch.enabled === 1 || patch.enabled === '1' ? 1 : 0;
      sets.push('enabled = ?');
      args.push(e);
    }
    if (!sets.length) throw new BadRequestException('Aucune valeur à mettre à jour');

    const res = await this.dataSource.query(
      `UPDATE bannedword SET ${sets.join(', ')} WHERE bannedwordid = ?`, [...args, id],
    );
    if (!res?.affectedRows && res?.affectedRows !== 0) throw new NotFoundException(`Mot ${id} introuvable`);
    return this.list();
  }

  async remove(id: number): Promise<BannedWordRow[]> {
    const res = await this.dataSource.query('DELETE FROM bannedword WHERE bannedwordid = ?', [id]);
    if (!res?.affectedRows) throw new NotFoundException(`Mot ${id} introuvable`);
    return this.list();
  }
}
