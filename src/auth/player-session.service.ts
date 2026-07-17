import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Valide un hash de session joueur contre la table maindb.playersession.
 *
 * Équivalent TS de Bdd/.../SessionWS.checkAndValidate. Validation par le hash SEUL, sans filtre
 * sur l'IP : l'IP HTTP vue par LobbyWS (4G/proxy/IPv6) ne correspond pas forcément à celle
 * enregistrée par la session TCP (stockée en `int`, IPv4 only). `SessionWS.checkAndValidate` a
 * depuis été aligné sur ce comportement (le filtre IP cassait le démarrage à froid sur mobile).
 *
 * Le hash est donc un bearer token : sa sûreté repose sur (1) son imprévisibilité — SecureRandom
 * dans InitSessionTask, cf. le correctif du générateur Math.random() — et (2) l'EXPIRATION
 * ci-dessous, qui doit rester identique à SESSION_MAX_AGE_DAYS côté Java (90 j).
 */
@Injectable()
export class PlayerSessionService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Durée de vie absolue d'une session, en jours, comptée depuis `startts`.
   * DOIT rester alignée sur SessionWS.SESSION_MAX_AGE_DAYS (Java) : deux valeurs différentes
   * feraient accepter ici une session que le Front refuse (ou l'inverse).
   */
  private static readonly SESSION_MAX_AGE_DAYS = 90;

  /** Retourne le playerId si une session ouverte ET NON EXPIRÉE porte ce hash, sinon null. */
  async resolvePlayerId(hash: string): Promise<number | null> {
    if (!hash) return null;
    // L'expiration est appliquée ICI, dans la requête, et non par un cron : un cron laisserait une
    // fenêtre où une session expirée validerait encore, et son arrêt supprimerait l'expiration en
    // silence. La constante est concaténée (pas un paramètre) : valeur de code, aucune injection.
    const rows = await this.dataSource.query<{ playerid: number }[]>(
      'SELECT playerid FROM playersession WHERE opened = 1 AND hash = ?' +
        ` AND startts > NOW() - INTERVAL ${PlayerSessionService.SESSION_MAX_AGE_DAYS} DAY LIMIT 1`,
      [hash],
    );
    if (!rows.length) return null;
    const playerId = rows[0].playerid;
    // playerid peut valoir -1 tant que la session n'est pas liée à un joueur (pré-login).
    return playerId > 0 ? playerId : null;
  }
}
