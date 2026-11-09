import { ConfigService } from '@nestjs/config';

/** Type de notification interne « code de liaison au Chance-o-mètre » (ClientCodes NotificationType). */
export const CHANCE_LINK_NOTIF_TYPE = 23;

/**
 * Nom qualifié d'une table de la base des comptes du Chance-o-mètre (CHANCE_DB, défaut `chance`).
 * Le nom de base est concaténé dans le SQL (une base ne se passe pas en paramètre) : vérifié ici.
 */
export function chanceTable(config: ConfigService, table: 'chanceuser' | 'chancelogin' | 'chancelink'): string {
  const db = config.get<string>('CHANCE_DB', 'chance');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(db)) throw new Error(`CHANCE_DB invalide : ${db}`);
  return `\`${db}\`.${table}`;
}
