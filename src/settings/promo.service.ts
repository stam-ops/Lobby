import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface PromoRow {
  promoId: number;
  name: string;
  credits: number;
  premiums: number;
  cams: number;
  codeCount: number;
  playerCount: number;
}

export interface CodePromoPlayerRow {
  playerId: number;
  screenName: string;
  creationTs: string;
  consumptionTs: string;
  sessionsLastMonth: number;
  amount: number;
  cams: number;
}

export interface CodePromoRow {
  codePromoId: number;
  promoId: number;
  code: string;
  codeState: number;
  codeLimit: number;
  usedCount: number;
}

/**
 * Codes promo : `promo` (le lot de récompenses) et `codepromo` (les codes qui l'attribuent).
 *
 * Contraintes d'intégrité à respecter (cf. mainmobdb-structure-final.sql) :
 *  - player.promoid → promo(promoid), NOT NULL DEFAULT 1 : la promo 1 est la promo par défaut du
 *    parrainage, la supprimer casserait les inscriptions. Une promo utilisée par des joueurs
 *    ne peut pas être supprimée (FK).
 *  - consumedpromotion.codepromoid → codepromo(codepromoid) : un code déjà consommé ne peut pas
 *    être supprimé (FK).
 * On vérifie AVANT de supprimer pour renvoyer un message clair plutôt qu'une erreur SQL brute.
 */
@Injectable()
export class PromoService {
  /** Promo par défaut référencée par player.promoid DEFAULT 1 — jamais supprimable. */
  private static readonly DEFAULT_PROMO_ID = 1;

  constructor(private readonly dataSource: DataSource) {}

  async promos(): Promise<PromoRow[]> {
    const rows = await this.dataSource.query<PromoRow[]>(`
      SELECT p.promoid AS promoId, p.name, p.credits, p.premiums, p.cams,
             (SELECT COUNT(*) FROM codepromo cp WHERE cp.promoid = p.promoid) AS codeCount,
             (SELECT COUNT(*) FROM player pl WHERE pl.promoid = p.promoid)    AS playerCount
      FROM promo p
      ORDER BY p.promoid DESC
    `);
    rows.forEach((r) => {
      r.credits = Number(r.credits);
      r.premiums = Number(r.premiums);
      r.cams = Number(r.cams);
      r.codeCount = Number(r.codeCount);
      r.playerCount = Number(r.playerCount);
    });
    return rows;
  }

  async addPromo(v: { name: string; credits: number; premiums: number; cams: number }): Promise<PromoRow[]> {
    const nums = [v.credits, v.premiums, v.cams];
    if (nums.some((n) => !Number.isInteger(n) || n < 0)) {
      throw new BadRequestException('credits, premiums et cams doivent être des entiers positifs');
    }
    if (v.premiums > 255) throw new BadRequestException('premiums est un TINYINT (max 255)');
    await this.dataSource.query(
      'INSERT INTO promo (name, credits, premiums, cams) VALUES (?, ?, ?, ?)',
      [(v.name ?? '').slice(0, 300), v.credits, v.premiums, v.cams],
    );
    return this.promos();
  }

  async deletePromo(promoId: number): Promise<PromoRow[]> {
    if (promoId === PromoService.DEFAULT_PROMO_ID) {
      throw new BadRequestException(
        'La promo 1 est la promo par défaut (player.promoid DEFAULT 1) : suppression interdite.',
      );
    }
    const [{ n: players }] = await this.dataSource.query<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM player WHERE promoid = ?', [promoId],
    );
    if (Number(players) > 0) {
      throw new BadRequestException(`Promo utilisée par ${players} joueur(s) : suppression impossible.`);
    }
    const [{ n: consumed }] = await this.dataSource.query<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM consumedpromotion c
       JOIN codepromo cp ON cp.codepromoid = c.codepromoid WHERE cp.promoid = ?`, [promoId],
    );
    if (Number(consumed) > 0) {
      throw new BadRequestException(`${consumed} code(s) de cette promo ont déjà été consommés : suppression impossible.`);
    }
    // Les codes non consommés partent avec la promo (sinon la FK codepromo→promo bloquerait).
    await this.dataSource.transaction(async (em) => {
      await em.query('DELETE FROM codepromo WHERE promoid = ?', [promoId]);
      const res = await em.query('DELETE FROM promo WHERE promoid = ?', [promoId]);
      if (!res?.affectedRows) throw new NotFoundException(`Promo ${promoId} introuvable`);
    });
    return this.promos();
  }

  async codes(promoId: number): Promise<CodePromoRow[]> {
    const rows = await this.dataSource.query<CodePromoRow[]>(
      `SELECT cp.codepromoid AS codePromoId, cp.promoid AS promoId, cp.code,
              cp.codestate AS codeState, cp.codelimit AS codeLimit,
              (SELECT COUNT(*) FROM consumedpromotion c WHERE c.codepromoid = cp.codepromoid) AS usedCount
       FROM codepromo cp WHERE cp.promoid = ? ORDER BY cp.codepromoid DESC`,
      [promoId],
    );
    rows.forEach((r) => {
      r.codeState = Number(r.codeState);
      r.codeLimit = Number(r.codeLimit);
      r.usedCount = Number(r.usedCount);
    });
    return rows;
  }

  /** Joueurs ayant consommé un code (consumedpromotion) + activité et soldes. */
  async codePlayers(codePromoId: number): Promise<CodePromoPlayerRow[]> {
    const rows = await this.dataSource.query<CodePromoPlayerRow[]>(
      `SELECT p.playerid AS playerId, pi.screenname AS screenName,
              p.creationts AS creationTs, c.consumptionts AS consumptionTs,
              (SELECT COUNT(*) FROM playersession ps
                 WHERE ps.playerid = p.playerid AND ps.startts >= NOW() - INTERVAL 30 DAY) AS sessionsLastMonth,
              COALESCE(pa.amount, 0) AS amount, COALESCE(pa.cams, 0) AS cams
       FROM consumedpromotion c
       JOIN player p ON p.playerid = c.playerid
       LEFT JOIN playerinfos pi ON pi.playerid = p.playerid
       LEFT JOIN playeraccount pa ON pa.playerid = p.playerid
       WHERE c.codepromoid = ?
       ORDER BY c.consumptionts DESC`,
      [codePromoId],
    );
    rows.forEach((r) => {
      r.sessionsLastMonth = Number(r.sessionsLastMonth);
      r.amount = Number(r.amount);
      r.cams = Number(r.cams);
    });
    return rows;
  }

  async addCode(promoId: number, code: string, codeLimit: number): Promise<CodePromoRow[]> {
    const c = (code ?? '').trim();
    if (!c) throw new BadRequestException('Code requis');
    if (c.length > 10) throw new BadRequestException('Le code fait 10 caractères maximum');
    if (!Number.isInteger(codeLimit) || codeLimit < 0) {
      throw new BadRequestException('codeLimit doit être un entier positif');
    }
    const exists = await this.dataSource.query('SELECT 1 FROM codepromo WHERE code = ? LIMIT 1', [c]);
    if (exists.length) throw new BadRequestException(`Le code « ${c} » existe déjà`);

    await this.dataSource.query(
      'INSERT INTO codepromo (promoid, code, codestate, codelimit) VALUES (?, ?, 0, ?)',
      [promoId, c, codeLimit],
    );
    return this.codes(promoId);
  }

  /** Seul champ éditable demandé : codelimit. */
  async setCodeLimit(codePromoId: number, codeLimit: number): Promise<CodePromoRow[]> {
    if (!Number.isInteger(codeLimit) || codeLimit < 0) {
      throw new BadRequestException('codeLimit doit être un entier positif');
    }
    const rows = await this.dataSource.query<{ promoid: number }[]>(
      'SELECT promoid FROM codepromo WHERE codepromoid = ?', [codePromoId],
    );
    if (!rows.length) throw new NotFoundException(`Code ${codePromoId} introuvable`);
    await this.dataSource.query(
      'UPDATE codepromo SET codelimit = ? WHERE codepromoid = ?', [codeLimit, codePromoId],
    );
    return this.codes(Number(rows[0].promoid));
  }

  async deleteCode(codePromoId: number): Promise<CodePromoRow[]> {
    const rows = await this.dataSource.query<{ promoid: number }[]>(
      'SELECT promoid FROM codepromo WHERE codepromoid = ?', [codePromoId],
    );
    if (!rows.length) throw new NotFoundException(`Code ${codePromoId} introuvable`);
    const [{ n }] = await this.dataSource.query<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM consumedpromotion WHERE codepromoid = ?', [codePromoId],
    );
    if (Number(n) > 0) {
      throw new BadRequestException(`Code déjà consommé par ${n} joueur(s) : suppression impossible.`);
    }
    await this.dataSource.query('DELETE FROM codepromo WHERE codepromoid = ?', [codePromoId]);
    return this.codes(Number(rows[0].promoid));
  }
}
