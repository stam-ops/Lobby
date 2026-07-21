import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationSentListDto, NotificationSentRowDto } from './dto/notification-sent.dto';

/**
 * Notifications push effectivement envoyées (table `notificationsentpoker`).
 *
 * ⚠️ VOLUME — la table n'est JAMAIS purgée : aucun `DELETE FROM notificationsentpoker` n'existe
 * dans le code, et il n'y a ni TTL ni partitionnement. Les rappels de tournoi
 * (GlobalNotificationManager, toutes les ~60 s, pour chaque joueur hors ligne opt-in) la font
 * grossir en continu. On pagine donc systématiquement.
 *
 * ⚠️ INDEX — les index disponibles sont `(playerid, ts)`, `(playerid, code, ts)` et
 * `(playerid, tournamentid)` : il n'y a AUCUN index sur `ts` ni sur `code` seuls. Un tri global sur
 * `ts` ferait donc un full scan. On trie sur la clé primaire décroissante, dont l'ordre suit celui
 * de `ts` (auto-increment + `DEFAULT CURRENT_TIMESTAMP`) tout en restant indexé.
 *
 * ⚠️ `notificationid` est nul sur 100 % des lignes écrites par le code actuel (les tâches qui
 * envoient les notifs personnelles passent `null`). La jointure est conservée pour les lignes
 * historiques, mais la colonne `code` reste la vraie source du type.
 */
@Injectable()
export class NotificationsSentService {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    player: string,
    code: number | undefined,
    limit: number,
    offset: number,
  ): Promise<NotificationSentListDto> {
    const conds: string[] = [];
    const args: (string | number)[] = [];
    if (player) {
      conds.push('(pi.screenname LIKE ? OR nsp.playerid = ?)');
      args.push(`%${player}%`, /^\d+$/.test(player) ? Number(player) : -1);
    }
    if (code != null) { conds.push('nsp.code = ?'); args.push(code); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const join = `
      FROM notificationsentpoker nsp
      LEFT JOIN playerinfos pi ON pi.playerid = nsp.playerid
      LEFT JOIN tournament t ON t.tournamentid = nsp.tournamentid
      LEFT JOIN notification n ON n.notificationid = nsp.notificationid
      ${where}`;

    const items = await this.dataSource.query<NotificationSentRowDto[]>(
      `SELECT nsp.notificationsentpokerid AS id, nsp.ts, nsp.playerid AS playerId,
              pi.screenname AS screenName, nsp.code,
              nsp.tournamentid AS tournamentId, t.label AS tournamentLabel,
              -- starttime est un TIMESTAMP DEFAULT 0 : on neutralise la date zéro plutôt que de
              -- laisser une valeur invalide remonter jusqu'au formatage côté UI.
              NULLIF(t.starttime, 0) AS tournamentStartTime,
              nsp.notificationid AS notificationId,
              n.notificationtype AS notificationType,
              n.creationts AS notificationCreationTs
       ${join}
       ORDER BY nsp.notificationsentpokerid DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total ${join}`, args,
    );
    return { items, total: Number(totalRow[0]?.total ?? 0) };
  }

  /** Codes réellement présents, pour ne proposer que des filtres qui ramènent des lignes. */
  async codes(): Promise<number[]> {
    const rows = await this.dataSource.query<{ code: number }[]>(
      'SELECT DISTINCT code FROM notificationsentpoker ORDER BY code',
    );
    return rows.map((r) => Number(r.code));
  }
}
