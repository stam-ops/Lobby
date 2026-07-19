import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CONFIG_PAGES, ConfigGroup, ConfigPage, pageFields } from './settings.constants';

export interface ConfigPayload {
  page: string;
  label: string;
  groups: ConfigGroup[];
  values: Record<string, number>;
}

/** Lecture/écriture des pages de configuration (chaque table sous-jacente n'a qu'une ligne). */
@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource) {}

  private pageOf(key: string): ConfigPage {
    const page = CONFIG_PAGES[key];
    if (!page) throw new NotFoundException(`Page de configuration inconnue : ${key}`);
    return page;
  }

  async get(key: string): Promise<ConfigPayload> {
    const page = this.pageOf(key);
    const fields = pageFields(page);

    // Une requête par table concernée (les colonnes viennent de la whitelist → pas d'injection).
    const tables = [...new Set(fields.map((f) => f.table))];
    const values: Record<string, number> = {};
    for (const table of tables) {
      const cols = fields.filter((f) => f.table === table).map((f) => f.name);
      const rows = await this.dataSource.query<Record<string, unknown>[]>(
        `SELECT ${cols.join(', ')} FROM ${table} LIMIT 1`,
      );
      if (!rows.length) throw new NotFoundException(`Aucune ligne dans ${table}`);
      for (const c of cols) values[c] = Number(rows[0][c]);
    }

    return { page: key, label: page.label, groups: page.groups, values };
  }

  async update(key: string, patch: Record<string, unknown>): Promise<ConfigPayload> {
    const page = this.pageOf(key);
    const byName = new Map(pageFields(page).map((f) => [f.name, f]));

    // Regroupe les écritures par table : une page peut couvrir plusieurs tables.
    const perTable = new Map<string, { sets: string[]; args: number[] }>();
    for (const [name, raw] of Object.entries(patch ?? {})) {
      const field = byName.get(name);
      if (!field) throw new BadRequestException(`Colonne non éditable : ${name}`);
      // Refus côté serveur : le grisage de l'UI n'est pas une garantie.
      if (field.readOnly) {
        throw new BadRequestException(`${name} est en lecture seule (${field.note ?? 'non modifiable'})`);
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${name} doit être un entier positif`);
      if (field.type === 'flag' && n !== 0 && n !== 1) {
        throw new BadRequestException(`${name} est un flag : 0 (off) ou 1 (on)`);
      }
      const entry = perTable.get(field.table) ?? { sets: [], args: [] };
      entry.sets.push(`${name} = ?`);
      entry.args.push(n);
      perTable.set(field.table, entry);
    }
    if (!perTable.size) throw new BadRequestException('Aucune valeur à mettre à jour');

    // Transaction : une page qui touche 2 tables ne doit pas rester à moitié appliquée.
    await this.dataSource.transaction(async (em) => {
      for (const [table, { sets, args }] of perTable) {
        // LIMIT 1 : filet de sécurité, ces tables n'ont qu'une ligne (et pas de PK).
        await em.query(`UPDATE ${table} SET ${sets.join(', ')} LIMIT 1`, args);
      }
    });

    return this.get(key);
  }
}
