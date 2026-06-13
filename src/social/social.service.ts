import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationDto } from './dto/notification.dto';
import { PlayerInfoDto, FriendDto, TournamentResultDto, PlayerStatsDto } from './dto/player-info.dto';

// Types mandatory pour les notifications (toujours remontées si non consommées)
const MANDATORY_NOTIF_TYPES = [1, 11, 12, 19, 20, 21];

@Injectable()
export class SocialService {
  constructor(private readonly dataSource: DataSource) {}

  // Source: Social.java → getPlayerNotifications(playerId, nbMaxNotifs)
  // Enrichi (cf. NotifationRow.InvitationNotifInfos legacy) : pour les demandes d'ami, on
  // joint friendrelation → playerinfos pour renvoyer l'AUTRE joueur (fromPlayerId/fromScreenName) :
  //   askFriendReceived → le demandeur ; askFriendAnswerReceived → celui qui a accepté.
  async getPlayerNotifications(playerId: number, nbMaxNotifs: number): Promise<NotificationDto[]> {
    const SELECT = `
      SELECT n.notificationid AS notificationId, n.notificationtype AS notificationType,
             n.isread AS isRead, n.isconsumed AS isConsumed,
             COALESCE(
               CASE WHEN fr.playeridfrom = n.playerid THEN fr.playeridto ELSE fr.playeridfrom END,
               cp.playeridfrom
             ) AS fromPlayerId,
             COALESCE(pifr.screenname, pcp.screenname) AS fromScreenName,
             cp.message        AS campokeMessage,
             cp.invitationtype AS inviteType,
             cp.gametableid    AS gameTableId
      FROM notification n
      LEFT JOIN friendrelation fr   ON fr.friendrelationid = n.friendrelationid
      LEFT JOIN campoke        cp   ON cp.campokeid        = n.campokeid
      LEFT JOIN playerinfos    pifr ON pifr.playerid =
                (CASE WHEN fr.playeridfrom = n.playerid THEN fr.playeridto ELSE fr.playeridfrom END)
      LEFT JOIN playerinfos    pcp  ON pcp.playerid = cp.playeridfrom
    `;
    const [mandatory, optional] = await Promise.all([
      this.dataSource.query<NotificationDto[]>(`
        ${SELECT}
        WHERE n.playerid = ?
          AND n.notificationtype IN (${MANDATORY_NOTIF_TYPES.join(',')})
          AND n.isconsumed = 0
        ORDER BY n.creationts DESC
      `, [playerId]),
      this.dataSource.query<NotificationDto[]>(`
        ${SELECT}
        WHERE n.playerid = ?
          AND n.notificationtype NOT IN (0,${MANDATORY_NOTIF_TYPES.join(',')})
        ORDER BY n.creationts DESC
        LIMIT ?
      `, [playerId, nbMaxNotifs]),
    ]);

    return [...mandatory, ...optional];
  }

  // Source: Social.java → getPlayerInfos(playerIdFrom, startScreenName, max)
  async getPlayerInfos(playerIdFrom: number, startScreenName: string, max: number): Promise<PlayerInfoDto[]> {
    const players = await this.dataSource.query<any[]>(`
      SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
             p.accounttype, pa.gamescore, pa.socialscore
      FROM playerinfos pi
      JOIN player        p  ON p.playerid  = pi.playerid
      JOIN playeraccount pa ON pa.playerid = pi.playerid
      WHERE pi.screenname LIKE ?
      LIMIT ?
    `, [`%${startScreenName}%`, max]);

    if (!players.length) return [];

    // État de relation par joueur (par rapport au chercheur), avec le sens from/to pour
    // distinguer demande envoyée (je suis from) vs reçue (je suis to). Valeurs renvoyées
    // = FriendRelationState client : 0=friend, 1=notFriend, 2=pending(reçue), 3=pendingFromMe(envoyée),
    // 4=blocked, -1=aucune relation.
    const playerIds = players.map(p => p.playerid);
    const relationByPlayer = new Map<number, number>();

    if (playerIdFrom > 0 && playerIds.length > 0) {
      const placeholders = playerIds.map(() => '?').join(',');
      const rows = await this.dataSource.query<
        { playeridfrom: number; playeridto: number; friendrelationstate: number }[]
      >(`
        SELECT playeridfrom, playeridto, friendrelationstate FROM friendrelation
        WHERE (playeridfrom = ? AND playeridto   IN (${placeholders}))
           OR (playeridto   = ? AND playeridfrom IN (${placeholders}))
      `, [playerIdFrom, ...playerIds, playerIdFrom, ...playerIds]);

      for (const r of rows) {
        const otherId = r.playeridfrom === playerIdFrom ? r.playeridto : r.playeridfrom;
        const iAmFrom = r.playeridfrom === playerIdFrom;
        let relationState: number;
        if (r.friendrelationstate === 0)      relationState = 0;        // friend
        else if (r.friendrelationstate === 2) relationState = iAmFrom ? 3 : 2; // envoyée / reçue
        else if (r.friendrelationstate === 4) relationState = 4;        // blocked
        else                                  relationState = -1;       // notFriend → aucune
        relationByPlayer.set(otherId, relationState);
      }
    }

    return players.map(p => {
      const relationState = relationByPlayer.get(p.playerid) ?? -1;
      return {
        playerId: p.playerid,
        screenName: p.screenname,
        fbUid: p.fbuid,
        firstName: p.firstname,
        lastName: p.lastname,
        accountType: p.accounttype,
        gameScore: p.gamescore,
        socialScore: p.socialscore,
        isFriend: relationState === 0,
        relationState,
      };
    });
  }

  // Source: Social.java → getFriends(playerId, max) — bidirectionnel via friendrelation.
  // friendrelationstate = 0 (friend) UNIQUEMENT : on exclut les demandes en attente
  // (state=2 pending) et les relations bloquées (state=4).
  async getFriends(playerId: number, max: number): Promise<FriendDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      (SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
              pa.gamescore, pa.socialscore
       FROM friendrelation fr
       JOIN playerinfos  pi ON pi.playerid = fr.playeridto
       JOIN playeraccount pa ON pa.playerid = pi.playerid
       WHERE fr.playeridfrom = ? AND fr.friendrelationstate = 0)
      UNION
      (SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
              pa.gamescore, pa.socialscore
       FROM friendrelation fr
       JOIN playerinfos  pi ON pi.playerid = fr.playeridfrom
       JOIN playeraccount pa ON pa.playerid = pi.playerid
       WHERE fr.playeridto = ? AND fr.friendrelationstate = 0)
      LIMIT ?
    `, [playerId, playerId, max]);

    return rows.map(this.mapFriendRow);
  }

  // Demandes d'amis REÇUES (à accepter/refuser) : je suis la cible (playeridto),
  // état pending (2). On renvoie les infos du demandeur (playeridfrom).
  async getIncomingFriendRequests(playerId: number): Promise<FriendDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
             pa.gamescore, pa.socialscore
      FROM friendrelation fr
      JOIN playerinfos  pi ON pi.playerid = fr.playeridfrom
      JOIN playeraccount pa ON pa.playerid = pi.playerid
      WHERE fr.playeridto = ? AND fr.friendrelationstate = 2
    `, [playerId]);
    return rows.map(this.mapFriendRow);
  }

  // Demandes d'amis ENVOYÉES (en attente de réponse) : je suis l'émetteur
  // (playeridfrom), état pending (2). On renvoie les infos de la cible (playeridto).
  async getOutgoingFriendRequests(playerId: number): Promise<FriendDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
             pa.gamescore, pa.socialscore
      FROM friendrelation fr
      JOIN playerinfos  pi ON pi.playerid = fr.playeridto
      JOIN playeraccount pa ON pa.playerid = pi.playerid
      WHERE fr.playeridfrom = ? AND fr.friendrelationstate = 2
    `, [playerId]);
    return rows.map(this.mapFriendRow);
  }

  private mapFriendRow = (r: any): FriendDto => ({
    playerId: r.playerid,
    screenName: r.screenname,
    fbUid: r.fbuid,
    firstName: r.firstname,
    lastName: r.lastname,
    gameScore: r.gamescore,
    socialScore: r.socialscore,
  });

  // Source: Social.java → getSponsoredFriends(playerId, max) — via sponsor table
  async getSponsoredFriends(playerId: number, max: number): Promise<FriendDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
             pa.gamescore, pa.socialscore
      FROM sponsor s
      JOIN playerinfos  pi ON pi.playerid = s.playeridsponsorised
      JOIN playeraccount pa ON pa.playerid = pi.playerid
      WHERE s.playeridsponsor = ?
      LIMIT ?
    `, [playerId, max]);

    return rows.map(r => ({
      playerId: r.playerid,
      screenName: r.screenname,
      fbUid: r.fbuid,
      firstName: r.firstname,
      lastName: r.lastname,
      gameScore: r.gamescore,
      socialScore: r.socialscore,
    }));
  }

  // Source: Social.java → getPlayerTournamentLastResults(playerId, max)
  getPlayerTournamentLastResults(playerId: number, max: number): Promise<TournamentResultDto[]> {
    return this.dataSource.query<TournamentResultDto[]>(`
      SELECT
        t.label                       AS label,
        t.playerscount                AS playersCount,
        UNIX_TIMESTAMP(t.starttime)   AS startTime,
        w.amount                      AS amount,
        gtp.rank                      AS \`rank\`
      FROM genericsubscription gs
      JOIN tournamentsubscription ts  ON ts.tournamentsubscriptionid = gs.tournamentsubscriptionid
      JOIN tournament             t   ON t.tournamentid              = ts.tournamentid
      JOIN wonprize               w   ON w.genericsubscriptionid     = gs.genericsubscriptionid
      JOIN gametable              gt  ON gt.tournamentid             = t.tournamentid
      JOIN gametableplayer        gtp ON gtp.gametableid             = gt.gametableid
                                     AND gtp.playerid                = ts.playerid
      WHERE gtp.rank != 0
        AND ts.playerid = ?
      ORDER BY t.starttime DESC
      LIMIT ?
    `, [playerId, max]);
  }

  // Source: Social.java → getPlayerStats(playerId) — agrège plusieurs requêtes
  async getPlayerStats(playerId: number): Promise<PlayerStatsDto> {
    const weekStart = `(CURDATE() - INTERVAL WEEKDAY(NOW()) DAY)`;

    const [handsTotal, handsWeek, cashTotal, cashWeek,
           sngTotal, sngWeek, tournTotal, tournWeek,
           nbTourn, nbWonTourn, nbSng] = await Promise.all([
      // Mains totales
      this.dataSource.query<{ nb: number }[]>(
        `SELECT COUNT(*) AS nb FROM gametableplayer WHERE playerid = ?`, [playerId]),
      // Mains cette semaine
      this.dataSource.query<{ nb: number }[]>(
        `SELECT COUNT(*) AS nb FROM gametableplayer WHERE playerid = ? AND startts >= ${weekStart}`, [playerId]),
      // Gains cash total (cashOut - cashIn)
      this.dataSource.query<{ amount: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN type=2 THEN amount ELSE -amount END),0) AS amount
         FROM gametransaction WHERE playerid = ? AND type IN (0,1,2)`, [playerId]),
      // Gains cash cette semaine
      this.dataSource.query<{ amount: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN type=2 THEN amount ELSE -amount END),0) AS amount
         FROM gametransaction WHERE playerid = ? AND type IN (0,1,2) AND createts >= ${weekStart}`, [playerId]),
      // Gains SNG total
      this.dataSource.query<{ amount: number }[]>(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
         JOIN genericsubscription gs ON gs.gametableplayerid=gtp.gametableplayerid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE gtp.playerid = ?`, [playerId]),
      // Gains SNG cette semaine
      this.dataSource.query<{ amount: number }[]>(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
         JOIN genericsubscription gs ON gs.gametableplayerid=gtp.gametableplayerid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE gtp.playerid = ? AND gtp.startts >= ${weekStart}`, [playerId]),
      // Gains tournoi total
      this.dataSource.query<{ amount: number }[]>(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM tournamentsubscription ts
         JOIN genericsubscription gs ON gs.tournamentsubscriptionid=ts.tournamentsubscriptionid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE ts.playerid = ?`, [playerId]),
      // Gains tournoi cette semaine
      this.dataSource.query<{ amount: number }[]>(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM tournamentsubscription ts
         JOIN genericsubscription gs ON gs.tournamentsubscriptionid=ts.tournamentsubscriptionid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE ts.playerid = ? AND ts.subscriptionts >= ${weekStart}`, [playerId]),
      // Nb tournois joués
      this.dataSource.query<{ nb: number }[]>(
        `SELECT COUNT(*) AS nb FROM tournamentsubscription WHERE playerid = ? AND subscription = 0`, [playerId]),
      // Nb tournois gagnés (rank=1 sur la dernière table)
      this.dataSource.query<{ nb: number }[]>(
        `SELECT COUNT(*) AS nb
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IS NULL
         WHERE gtp.playerid = ? AND gtp.rank = 1`, [playerId]),
      // Nb SNG joués
      this.dataSource.query<{ nb: number }[]>(
        `SELECT COUNT(*) AS nb
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
         WHERE gtp.playerid = ?`, [playerId]),
    ]);

    return {
      playerId,
      nbHandTotal: Number(handsTotal[0].nb),
      nbHandWeek: Number(handsWeek[0].nb),
      winCashTotal: Number(cashTotal[0].amount),
      winCashWeek: Number(cashWeek[0].amount),
      winSngTotal: Number(sngTotal[0].amount),
      winSngWeek: Number(sngWeek[0].amount),
      winTournamentTotal: Number(tournTotal[0].amount),
      winTournamentWeek: Number(tournWeek[0].amount),
      nbTournamentTotal: Number(nbTourn[0].nb),
      nbWonTournamentTotal: Number(nbWonTourn[0].nb),
      nbSngTotal: Number(nbSng[0].nb),
    };
  }
}
