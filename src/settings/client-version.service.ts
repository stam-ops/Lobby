import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ClientVersionRow {
  id: number;
  os: number;
  requiredVersion: number;
  description: string;
  currentVersion: string;
}

export interface ClientVersionPayload {
  /** Seuil effectif par OS = MAX(requiredversion) (cf. Player.getCurrentAppVersion(os)). */
  platforms: { os: number; requiredVersion: number | null }[];
  rows: ClientVersionRow[];
}

/**
 * Version client requise, PAR PLATEFORME (os : 0 = android, 1 = ios).
 *
 * Le seuil appliqué au client est MAX(requiredversion) pour son os — pas une ligne précise.
 * Écrire un seuil > version publiée sur le store = LOCKOUT des joueurs de cette plateforme.
 */
@Injectable()
export class ClientVersionService {
  constructor(private readonly dataSource: DataSource) {}

  async get(): Promise<ClientVersionPayload> {
    const rows = await this.dataSource.query<ClientVersionRow[]>(
      `SELECT clientversionid AS id, os, requiredversion AS requiredVersion,
              description, currentversion AS currentVersion
       FROM clientversion ORDER BY os, clientversionid`,
    );
    rows.forEach((r) => {
      r.os = Number(r.os);
      r.requiredVersion = Number(r.requiredVersion);
    });

    const platforms = [0, 1].map((os) => {
      const forOs = rows.filter((r) => r.os === os);
      return {
        os,
        requiredVersion: forOs.length ? Math.max(...forOs.map((r) => r.requiredVersion)) : null,
      };
    });
    return { platforms, rows };
  }

  /**
   * Ajoute une version au catalogue (INSERT).
   * ⚠️ Le seuil étant MAX(requiredversion) par OS, insérer une version SUPÉRIEURE à l'actuelle
   * relève immédiatement le minimum requis pour cet OS.
   */
  async addVersion(v: {
    os: number; requiredVersion: number; description?: string; currentVersion?: string;
  }): Promise<ClientVersionPayload> {
    if (v.os !== 0 && v.os !== 1) throw new BadRequestException('os doit valoir 0 (Android) ou 1 (iOS)');
    if (!Number.isInteger(v.requiredVersion) || v.requiredVersion < 1) {
      throw new BadRequestException('requiredVersion doit être un entier >= 1');
    }
    await this.dataSource.query(
      'INSERT INTO clientversion (os, requiredversion, description, currentversion) VALUES (?, ?, ?, ?)',
      [v.os, v.requiredVersion, (v.description ?? '').slice(0, 100), (v.currentVersion ?? '').slice(0, 20)],
    );
    return this.get();
  }

  /** UPDATE clientversion SET requiredversion = ? WHERE os = ? (aligne toutes les lignes de l'OS). */
  async setRequiredVersion(os: number, requiredVersion: number): Promise<ClientVersionPayload> {
    if (os !== 0 && os !== 1) throw new BadRequestException('os doit valoir 0 (Android) ou 1 (iOS)');
    if (!Number.isInteger(requiredVersion) || requiredVersion < 1) {
      throw new BadRequestException('requiredVersion doit être un entier >= 1');
    }
    const res = await this.dataSource.query(
      'UPDATE clientversion SET requiredversion = ? WHERE os = ?', [requiredVersion, os],
    );
    if (!res?.affectedRows) {
      throw new BadRequestException(`Aucune ligne clientversion pour os = ${os}`);
    }
    return this.get();
  }
}
