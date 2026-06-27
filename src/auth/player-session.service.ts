import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Valide un hash de session joueur contre la table maindb.playersession.
 *
 * Équivalent TS de Bdd/.../SessionWS.checkAndValidate, MAIS sans le filtre sur l'IP :
 * l'IP HTTP vue par LobbyWS (4G/proxy/IPv6) ne correspond pas forcément à celle enregistrée
 * par la session TCP (stockée en `int`, IPv4 only). On valide donc par le hash seul.
 */
@Injectable()
export class PlayerSessionService {
  constructor(private readonly dataSource: DataSource) {}

  /** Retourne le playerId si une session ouverte porte ce hash, sinon null. */
  async resolvePlayerId(hash: string): Promise<number | null> {
    if (!hash) return null;
    const rows = await this.dataSource.query<{ playerid: number }[]>(
      'SELECT playerid FROM playersession WHERE opened = 1 AND hash = ? LIMIT 1',
      [hash],
    );
    if (!rows.length) return null;
    const playerId = rows[0].playerid;
    // playerid peut valoir -1 tant que la session n'est pas liée à un joueur (pré-login).
    return playerId > 0 ? playerId : null;
  }
}
