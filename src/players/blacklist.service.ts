import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BlacklistEntryDto } from './dto/blacklist.dto';

/**
 * Propriétaire de la table `blacklist` (blocage d'accès total au site).
 * Colonnes : blacklistid (PK), connectionid?, playerid?, ip?, startts.
 *
 * Bannir = INSERT une ligne avec le(s) critère(s) fourni(s).
 * Lever le ban = DELETE les lignes correspondant au(x) critère(s). Donc réversible.
 */
@Injectable()
export class BlacklistService {
  constructor(private readonly dataSource: DataSource) {}

  private requireOne(e: BlacklistEntryDto): void {
    if (e.playerId == null && e.connectionId == null && e.ip == null) {
      throw new BadRequestException('Fournir au moins un critère : playerId, connectionId ou ip.');
    }
  }

  /** Colonnes/valeurs présentes dans l'entrée. */
  private parts(e: BlacklistEntryDto): { cols: string[]; args: (number)[] } {
    const cols: string[] = [];
    const args: number[] = [];
    if (e.playerId != null) { cols.push('playerid'); args.push(e.playerId); }
    if (e.connectionId != null) { cols.push('connectionid'); args.push(e.connectionId); }
    if (e.ip != null) { cols.push('ip'); args.push(e.ip); }
    return { cols, args };
  }

  /** Ajoute une entrée (idempotent sur les mêmes critères exacts). */
  async add(e: BlacklistEntryDto): Promise<void> {
    this.requireOne(e);
    const { cols, args } = this.parts(e);
    const where = cols.map((c) => `${c} = ?`).join(' AND ');
    const exists = await this.dataSource.query(`SELECT 1 FROM blacklist WHERE ${where} LIMIT 1`, args);
    if (exists.length) return;
    const placeholders = cols.map(() => '?').join(', ');
    await this.dataSource.query(
      `INSERT INTO blacklist (${cols.join(', ')}) VALUES (${placeholders})`,
      args,
    );
  }

  /** Supprime les entrées correspondant au(x) critère(s). */
  async remove(e: BlacklistEntryDto): Promise<void> {
    this.requireOne(e);
    const { cols, args } = this.parts(e);
    const where = cols.map((c) => `${c} = ?`).join(' AND ');
    await this.dataSource.query(`DELETE FROM blacklist WHERE ${where}`, args);
  }

  isPlayerBanned(playerId: number) {
    return this.dataSource
      .query(`SELECT 1 FROM blacklist WHERE playerid = ? LIMIT 1`, [playerId])
      .then((r: unknown[]) => r.length > 0);
  }
}
