import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CONFIG_TABLES, ConfigField } from './settings.constants';

export interface ConfigPayload {
  table: string;
  fields: ConfigField[];
  values: Record<string, number>;
}

/** Lecture/écriture des tables de configuration (une ligne chacune). */
@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource) {}

  private fieldsOf(table: string): ConfigField[] {
    const fields = CONFIG_TABLES[table];
    if (!fields) throw new NotFoundException(`Table de configuration inconnue : ${table}`);
    return fields;
  }

  async get(table: string): Promise<ConfigPayload> {
    const fields = this.fieldsOf(table);
    const cols = fields.map((f) => f.name).join(', ');
    // `table`/`cols` viennent de la whitelist → pas d'injection possible.
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT ${cols} FROM ${table} LIMIT 1`,
    );
    if (!rows.length) throw new NotFoundException(`Aucune ligne dans ${table}`);

    const values: Record<string, number> = {};
    for (const f of fields) values[f.name] = Number(rows[0][f.name]);
    return { table, fields, values };
  }

  async update(table: string, patch: Record<string, unknown>): Promise<ConfigPayload> {
    const fields = this.fieldsOf(table);
    const byName = new Map(fields.map((f) => [f.name, f]));

    const sets: string[] = [];
    const args: number[] = [];
    for (const [key, raw] of Object.entries(patch ?? {})) {
      const field = byName.get(key);
      if (!field) throw new BadRequestException(`Colonne non éditable : ${key}`);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        throw new BadRequestException(`${key} doit être un entier positif`);
      }
      if (field.type === 'flag' && n !== 0 && n !== 1) {
        throw new BadRequestException(`${key} est un flag : 0 (off) ou 1 (on)`);
      }
      sets.push(`${key} = ?`);
      args.push(n);
    }
    if (!sets.length) throw new BadRequestException('Aucune valeur à mettre à jour');

    // LIMIT 1 : filet de sécurité, ces tables n'ont qu'une ligne (et pas de PK).
    await this.dataSource.query(`UPDATE ${table} SET ${sets.join(', ')} LIMIT 1`, args);
    return this.get(table);
  }
}
