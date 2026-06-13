import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationDto } from './dto/notification.dto';
import { PlayerInfoDto, FriendDto, TournamentResultDto, PlayerStatsDto } from './dto/player-info.dto';

// Types mandatory pour les notifications (toujours remontées si non consommées).
// Inclut les bonus dédiés RÉCLAMABLES (NotificationType) : welcomeBonus(5), dailyBonus(6),
// monthlyBonus(7), specialBonus(8), shareBonus(9), camBonus(18), newFilleul(11), newSponsor(12)
// → filtrés par isconsumed=0 donc disparaissent une fois réclamés (giveBonus les consomme).
const MANDATORY_NOTIF_TYPES = [1, 5, 6, 7, 8, 9, 11, 12, 18, 19, 20, 21];

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
             cp.gametableid    AS gameTableId,
             b.bonustype       AS bonusType
      FROM notification n
      LEFT JOIN friendrelation fr   ON fr.friendrelationid = n.friendrelationid
      LEFT JOIN campoke        cp   ON cp.campokeid        = n.campokeid
      LEFT JOIN bonus          b    ON b.bonusid           = n.bonusid
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

  // Source: Social.java → getSponsoredFriends(playerId, max) — via sponsor table.
  // Colonnes réelles (cf. legacy Bdd) : sponsor.playeridfrom = parrain, playeridto = filleul.
  async getSponsoredFriends(playerId: number, max: number): Promise<FriendDto[]> {
    const rows = await this.dataSource.query<any[]>(`
      SELECT pi.playerid, pi.screenname, pi.fbuid, pi.firstname, pi.lastname,
             pa.gamescore, pa.socialscore
      FROM sponsor s
      JOIN playerinfos  pi ON pi.playerid = s.playeridto
      JOIN playeraccount pa ON pa.playerid = pi.playerid
      WHERE s.playeridfrom = ?
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

    // Helpers de résilience : ce endpoint agrège des requêtes legacy historiquement
    // jamais exécutées (aucun appelant avant l'écran profil). Pour ne PAS faire échouer
    // tout l'endpoint (et donc le screenName + gameScore) si une de ces stats casse, on
    // dégrade chaque sous-requête vers une valeur par défaut.
    const nbQ = (sql: string) =>
      this.dataSource.query<{ nb: number }[]>(sql, [playerId])
        .then(r => Number(r[0]?.nb ?? 0)).catch(() => 0);
    const amountQ = (sql: string) =>
      this.dataSource.query<{ amount: number }[]>(sql, [playerId])
        .then(r => Number(r[0]?.amount ?? 0)).catch(() => 0);

    const [identityRows, handsTotal, handsWeek, cashTotal, cashWeek,
           sngTotal, sngWeek, tournTotal, tournWeek,
           nbTourn, nbWonTourn, nbSng] = await Promise.all([
      // Identité + score XP du joueur (screenname éditable + gamescore pour le niveau)
      this.dataSource.query<{ screenname: string; gamescore: number; socialscore: number }[]>(
        `SELECT pi.screenname, pa.gamescore, pa.socialscore
         FROM playerinfos pi
         JOIN playeraccount pa ON pa.playerid = pi.playerid
         WHERE pi.playerid = ?`, [playerId])
        .catch(() => [] as { screenname: string; gamescore: number; socialscore: number }[]),
      // Mains totales
      nbQ(`SELECT COUNT(*) AS nb FROM gametableplayer WHERE playerid = ?`),
      // Mains cette semaine
      nbQ(`SELECT COUNT(*) AS nb FROM gametableplayer WHERE playerid = ? AND startts >= ${weekStart}`),
      // Gains cash total (cashOut - cashIn) — gametransaction est lié au joueur via
      // genericsubscription → gametableplayer (pas de colonne playerid directe).
      amountQ(
        `SELECT COALESCE(SUM(CASE WHEN gtr.type=2 THEN gtr.amount ELSE -gtr.amount END),0) AS amount
         FROM gametransaction gtr
         JOIN genericsubscription gs ON gs.genericsubscriptionid = gtr.genericsubscriptionid
         JOIN gametableplayer gtp ON gtp.gametableplayerid = gs.gametableplayerid
         WHERE gtp.playerid = ? AND gtr.type IN (0,1,2)`),
      // Gains cash cette semaine
      amountQ(
        `SELECT COALESCE(SUM(CASE WHEN gtr.type=2 THEN gtr.amount ELSE -gtr.amount END),0) AS amount
         FROM gametransaction gtr
         JOIN genericsubscription gs ON gs.genericsubscriptionid = gtr.genericsubscriptionid
         JOIN gametableplayer gtp ON gtp.gametableplayerid = gs.gametableplayerid
         WHERE gtp.playerid = ? AND gtr.type IN (0,1,2) AND gtp.startts >= ${weekStart}`),
      // Gains SNG total
      amountQ(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
         JOIN genericsubscription gs ON gs.gametableplayerid=gtp.gametableplayerid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE gtp.playerid = ?`),
      // Gains SNG cette semaine
      amountQ(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
         JOIN genericsubscription gs ON gs.gametableplayerid=gtp.gametableplayerid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE gtp.playerid = ? AND gtp.startts >= ${weekStart}`),
      // Gains tournoi total
      amountQ(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM tournamentsubscription ts
         JOIN genericsubscription gs ON gs.tournamentsubscriptionid=ts.tournamentsubscriptionid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE ts.playerid = ?`),
      // Gains tournoi cette semaine
      amountQ(
        `SELECT COALESCE(SUM(wp.amount),0) AS amount
         FROM tournamentsubscription ts
         JOIN genericsubscription gs ON gs.tournamentsubscriptionid=ts.tournamentsubscriptionid
         JOIN wonprize wp ON wp.genericsubscriptionid=gs.genericsubscriptionid
         WHERE ts.playerid = ? AND ts.subscriptionts >= ${weekStart}`),
      // Nb tournois joués
      nbQ(`SELECT COUNT(*) AS nb FROM tournamentsubscription WHERE playerid = ? AND subscription = 0`),
      // Nb tournois gagnés (rank=1 sur la dernière table)
      nbQ(
        `SELECT COUNT(*) AS nb
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IS NULL
         WHERE gtp.playerid = ? AND gtp.rank = 1`),
      // Nb SNG joués
      nbQ(
        `SELECT COUNT(*) AS nb
         FROM gametableplayer gtp
         JOIN gametable gt ON gt.gametableid=gtp.gametableid AND gt.gametablearchetypeid IN (2,3,4,5,6,7,17,18)
         WHERE gtp.playerid = ?`),
    ]);
    const identity = identityRows[0];

    return {
      playerId,
      screenName:  identity?.screenname  ?? '',
      gameScore:   Number(identity?.gamescore   ?? 0),
      socialScore: Number(identity?.socialscore ?? 0),
      nbHandTotal: handsTotal,
      nbHandWeek: handsWeek,
      winCashTotal: cashTotal,
      winCashWeek: cashWeek,
      winSngTotal: sngTotal,
      winSngWeek: sngWeek,
      winTournamentTotal: tournTotal,
      winTournamentWeek: tournWeek,
      nbTournamentTotal: nbTourn,
      nbWonTournamentTotal: nbWonTourn,
      nbSngTotal: nbSng,
    };
  }
}
