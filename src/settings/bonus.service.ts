import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface BonusRow {
  bonusId: number;
  bonusType: number;
  socialXpVal: number;
  pokerXpVal: number;
  bankrollVal: number;
  cams: number;
}

/**
 * Table `bonus` : une ligne par type de bonus (bonustype → campok.client.notification.BonusType).
 * Multi-lignes, donc éditée comme une grille et non via le module « page mono-ligne ».
 */
@Injectable()
export class BonusService {
  /** Colonnes de valeurs éditables — whitelist (garde-fou SQL + validation). */
  private static readonly EDITABLE = ['socialxpval', 'pokerxpval', 'bankrollval', 'cams'] as const;

  constructor(private readonly dataSource: DataSource) {}

  async list(): Promise<BonusRow[]> {
    const rows = await this.dataSource.query<BonusRow[]>(`
      SELECT bonusid AS bonusId, bonustype AS bonusType,
             socialxpval AS socialXpVal, pokerxpval AS pokerXpVal,
             bankrollval AS bankrollVal, cams
      FROM bonus
      ORDER BY bonustype, bonusid
    `);
    rows.forEach((r) => {
      r.bonusType = Number(r.bonusType);
      r.socialXpVal = Number(r.socialXpVal);
      r.pokerXpVal = Number(r.pokerXpVal);
      r.bankrollVal = Number(r.bankrollVal);
      r.cams = Number(r.cams);
    });
    return rows;
  }

  /** Met à jour les valeurs d'une ligne bonus (bonustype n'est pas modifiable : c'est la clé métier). */
  async update(bonusId: number, patch: Record<string, unknown>): Promise<BonusRow[]> {
    // camelCase (API) → colonne SQL, en restant dans la whitelist.
    const COLUMN: Record<string, string> = {
      socialXpVal: 'socialxpval',
      pokerXpVal: 'pokerxpval',
      bankrollVal: 'bankrollval',
      cams: 'cams',
    };

    const sets: string[] = [];
    const args: number[] = [];
    for (const [key, raw] of Object.entries(patch ?? {})) {
      const col = COLUMN[key];
      if (!col || !BonusService.EDITABLE.includes(col as typeof BonusService.EDITABLE[number])) {
        throw new BadRequestException(`Champ non éditable : ${key}`);
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${key} doit être un entier positif`);
      sets.push(`${col} = ?`);
      args.push(n);
    }
    if (!sets.length) throw new BadRequestException('Aucune valeur à mettre à jour');

    const res = await this.dataSource.query(
      `UPDATE bonus SET ${sets.join(', ')} WHERE bonusid = ?`, [...args, bonusId],
    );
    if (!res?.affectedRows) throw new NotFoundException(`Bonus ${bonusId} introuvable`);
    return this.list();
  }
}
