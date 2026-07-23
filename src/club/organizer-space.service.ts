import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  FREE_PRIZE_STRUCTURE_ID, TournamentArchetypeService,
} from '../catalog/tournament-archetype.service';

/**
 * Valeurs proposées aux organisateurs, et SEULES acceptées.
 *
 * Ces listes bornent volontairement la configuration : chaque combinaison possible ici a un
 * comportement connu du moteur. Ouvrir ces champs en saisie libre reviendrait à laisser un
 * utilisateur externe produire des tournois ingérables (tables de 2, stacks aberrants…).
 *
 * `subscriptionMinutes` : 0 = inscriptions ouvertes dès la création de l'instance ; 60 = une heure
 * avant le début. Cf. le piège documenté dans TournamentArchetypeService (0 ≠ « pas d'inscription »).
 */
const CLUB_OPTIONS = {
  maxPlayers: [50, 100, 200, 400, 600, 1000],
  tableSize: [4, 6, 8],
  buyIn: [100, 300, 500, 1000],
  initStack: [1500, 3000, 5000, 10000],
  subscriptionMinutes: [0, 60],
  lastLateRegisterLevel: [1, 2, 3],
} as const;

/**
 * Fragment SQL comptant les tournois d'un organisateur qui PÈSENT sur son quota, sur 30 jours
 * glissants. Attend `?` = organizerid.
 *
 * Un tournoi annulé ne compte pas : l'organisateur n'a rien consommé. Deux formes d'annulation,
 * qu'il faut distinguer :
 *   - édition créée puis annulée (`gamestate = 5`) — par l'organisateur ou automatiquement, faute
 *     d'inscrits ;
 *   - annulée AVANT création de l'édition : pas d'instance, et archétype désactivé.
 *
 * ⚠️ Les deux conditions sont écrites en tolérant le NULL du LEFT JOIN. `NOT (t.gamestate = 5)`
 * vaudrait NULL quand aucune instance n'existe, donc faux, et écarterait à tort les tournois
 * simplement pas encore créés.
 *
 * ⚠️ `isvalid = 1` seul ne signifie PAS annulé : un archétype « une seule fois » se désactive de
 * lui-même une fois son édition créée. On ne l'interprète donc qu'en l'absence d'instance.
 */
export const QUOTA_COUNT_SQL = `
  SELECT COUNT(*) FROM organizerarchetype oa
    JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = oa.tournamentarchetypeid
    LEFT JOIN tournament t ON t.tournamentid = (
          SELECT t2.tournamentid FROM tournament t2
           WHERE t2.tournamentarchetypeid = oa.tournamentarchetypeid
           ORDER BY t2.tournamentid DESC LIMIT 1)
   WHERE oa.organizerid = ?
     AND oa.creationts > NOW() - INTERVAL 30 DAY
     AND (t.gamestate IS NULL OR t.gamestate <> 5)
     AND (t.tournamentid IS NOT NULL OR ta.isvalid = 0)`;

/** Nature d'une demande d'organisateur — doit rester alignée sur l'énumération du front. */
export const REQUEST_TYPE = { moreTournaments: 1, morePlayers: 2, other: 3 } as const;
const REQUEST_TYPES: number[] = Object.values(REQUEST_TYPE);

/** campok.client.codes.tournament.GameState */
const GAME_STATE = { notStarted: 0, playing: 1, inBreak: 2, addonBreak: 3, ended: 4, canceled: 5 } as const;
/** campok.client.codes.tournament.SubscriptionState */
const SUBSCRIPTION_STATE = { notOpened: -1, subscription: 0, closed: 1 } as const;

/** Retourne la valeur si elle appartient à la liste autorisée, sinon rejette la requête. */
function pick(value: unknown, allowed: readonly number[], label: string): number {
  const n = Number(value);
  if (!allowed.includes(n)) {
    throw new BadRequestException(`${label} : valeur non autorisée (${allowed.join(', ')}).`);
  }
  return n;
}

export interface OrganizerProfile {
  organizerId: number;
  name: string;
  contactEmail: string;
  maxTournamentsPerMonth: number;
  maxPlayersPerTournament: number;
  /** Tournois créés sur les 30 derniers jours glissants. */
  usedThisMonth: number;
  /** null si le quota est illimité. */
  remainingThisMonth: number | null;
}

/**
 * Espace organisateur — TOUTES les méthodes prennent `organizerId` en premier paramètre.
 *
 * Ce n'est pas une convention de style : c'est ce qui rend le cloisonnement vérifiable. Aucune
 * méthode ne peut être appelée sans périmètre, et chaque requête joint `organizerarchetype` pour
 * restreindre aux archétypes de l'organisateur. Une lecture non filtrée ne compile pas.
 *
 * ⚠️ Ces services ne doivent JAMAIS être exposés sous /admin : la séparation des préfixes est la
 * seconde barrière, après le rôle.
 */
@Injectable()
export class OrganizerSpaceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly archetypes: TournamentArchetypeService,
  ) {}

  /** Profil + consommation du quota. */
  async profile(organizerId: number): Promise<OrganizerProfile> {
    const [row] = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT o.organizerid AS organizerId, o.name, o.contactemail AS contactEmail,
              o.maxtournamentspermonth AS maxTournamentsPerMonth,
              o.maxplayerspertournament AS maxPlayersPerTournament,
              (${QUOTA_COUNT_SQL}) AS usedThisMonth
         FROM organizer o WHERE o.organizerid = ?`,
      // Le premier `?` alimente QUOTA_COUNT_SQL, le second le WHERE de la requête englobante.
      [organizerId, organizerId],
    );
    if (!row) throw new NotFoundException('Organisateur introuvable');

    const max = Number(row.maxTournamentsPerMonth);
    const used = Number(row.usedThisMonth);
    return {
      organizerId: Number(row.organizerId),
      name: String(row.name),
      contactEmail: String(row.contactEmail),
      maxTournamentsPerMonth: max,
      maxPlayersPerTournament: Number(row.maxPlayersPerTournament),
      usedThisMonth: used,
      // 0 = illimité, d'où le null plutôt qu'un nombre négatif trompeur.
      remainingThisMonth: max === 0 ? null : Math.max(0, max - used),
    };
  }

  /**
   * Enregistre une demande de l'organisateur (relèvement de seuil, autre).
   *
   * Volontairement sans effet sur les quotas : la demande est un message, l'arbitrage reste
   * humain. Un organisateur ne doit pas pouvoir relever ses propres plafonds.
   */
  async createRequest(organizerId: number, type: number, message: string) {
    if (!REQUEST_TYPES.includes(type)) {
      throw new BadRequestException('Type de demande inconnu.');
    }
    const text = (message ?? '').trim().slice(0, 2000);
    // Une demande « Autre » sans texte serait ininterprétable par l'administrateur.
    if (type === REQUEST_TYPE.other && !text) {
      throw new BadRequestException('Précisez votre demande.');
    }

    // Une demande identique déjà en attente : inutile d'en empiler une seconde, l'administrateur
    // verrait deux fois le même dossier sans information supplémentaire.
    const [pending] = await this.dataSource.query<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM organizerrequest
        WHERE organizerid = ? AND type = ? AND handledts IS NULL`,
      [organizerId, type],
    );
    if (Number(pending?.n) > 0) {
      throw new BadRequestException(
        'Une demande de ce type est déjà en cours de traitement. Nous revenons vers vous rapidement.',
      );
    }

    await this.dataSource.query(
      'INSERT INTO organizerrequest (organizerid, type, message) VALUES (?, ?, ?)',
      [organizerId, type, text || null],
    );
    return this.myRequests(organizerId);
  }

  /** Ses propres demandes, pour qu'il sache où elles en sont. */
  async myRequests(organizerId: number) {
    const rows = await this.dataSource.query(
      `SELECT organizerrequestid AS id, type, message,
              creationts AS creationTs, handledts AS handledTs
         FROM organizerrequest
        WHERE organizerid = ?
        ORDER BY creationts DESC
        LIMIT 20`,
      [organizerId],
    );
    return rows.map((r: Record<string, unknown>) => ({ ...r, handled: r.handledTs != null }));
  }

  /** Les archétypes de cet organisateur, avec le nombre d'instances déjà jouées. */
  async myArchetypes(organizerId: number) {
    const rows = await this.dataSource.query(`
      SELECT ta.tournamentarchetypeid AS id, ta.label, ta.type, ta.accesscode AS accessCode,
             ta.periodtype AS periodType, ta.perioddata AS periodData,
             UNIX_TIMESTAMP(ta.periodstart) AS periodStartEpoch,
             ta.buyin AS buyIn, ta.minplayers AS minPlayers, ta.maxplayers AS maxPlayers,
             ta.tablesize AS tableSize, ta.initstack AS initStack,
             ta.timeforsubscriptionsbeforestart AS subscriptionMinutes,
             ta.lastlateregisterlevel AS lastLateRegisterLevel,
             -- La cadence n'est pas stockée telle quelle : on remonte la durée de niveau, dont
             -- l'interface déduit le libellé (Turbo / Standard / Long).
             gt.leveltime AS levelTimeMs,
             (ta.isvalid = 0) AS active,
             oa.creationts AS createdTs,
             (SELECT COUNT(*) FROM tournament t
               WHERE t.tournamentarchetypeid = ta.tournamentarchetypeid) AS tournamentCount,
             -- État RÉEL du tournoi : l'archétype ne sait que s'il sera créé. Les états vivants
             -- (inscriptions ouvertes, en cours, terminé) sont portés par l'instance. Un archétype
             -- « une seule fois » n'en a qu'une, d'où le LIMIT 1 sur la plus récente.
             inst.tournamentid AS tournamentId,
             inst.subscriptionstate AS subscriptionState,
             inst.gamestate AS gameState,
             inst.playerscount AS playersCount
        FROM organizerarchetype oa
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = oa.tournamentarchetypeid
        LEFT JOIN gametime gt ON gt.gametimeid = ta.gametimeid
        LEFT JOIN tournament inst ON inst.tournamentid = (
              SELECT t2.tournamentid FROM tournament t2
               WHERE t2.tournamentarchetypeid = ta.tournamentarchetypeid
               ORDER BY t2.tournamentid DESC LIMIT 1)
       WHERE oa.organizerid = ?
       ORDER BY oa.creationts DESC
    `, [organizerId]);

    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      active: Number(r.active) === 1,
      tournamentCount: Number(r.tournamentCount),
      // Ces trois colonnes viennent d'un LEFT JOIN : elles sont nulles tant qu'aucune instance
      // n'existe. On préserve le null plutôt que de le convertir en 0, qui serait un état valide
      // (0 = inscriptions ouvertes / jeu non démarré) et donc trompeur.
      tournamentId: r.tournamentId == null ? null : Number(r.tournamentId),
      subscriptionState: r.subscriptionState == null ? null : Number(r.subscriptionState),
      gameState: r.gameState == null ? null : Number(r.gameState),
      playersCount: r.playersCount == null ? null : Number(r.playersCount),
    }));
  }

  /**
   * Résultats des tournois joués, restreints aux archétypes de l'organisateur.
   *
   * `tournamentplayer` porte le classement final ; on ne remonte que les places payées pour
   * garder la table lisible.
   */
  async myResults(organizerId: number, archetypeId?: number) {
    const args: number[] = [organizerId];
    let cond = '';
    if (archetypeId != null) { cond = 'AND ta.tournamentarchetypeid = ?'; args.push(archetypeId); }

    return this.dataSource.query(`
      SELECT t.tournamentid AS tournamentId, t.label AS tournamentLabel,
             NULLIF(t.starttime, 0) AS startTime, t.gamestate AS gameState,
             t.playerscount AS playersCount,
             ta.tournamentarchetypeid AS archetypeId, ta.label AS archetypeLabel
        FROM organizerarchetype oa
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = oa.tournamentarchetypeid
        JOIN tournament t ON t.tournamentarchetypeid = ta.tournamentarchetypeid
       WHERE oa.organizerid = ? ${cond}
       ORDER BY t.starttime DESC
       LIMIT 200
    `, args);
  }

  /**
   * Classement GÉNÉRAL cumulé sur tous les tournois terminés de l'organisateur.
   *
   * Barème : un tournoi à N joueurs rapporte N points au vainqueur et 1 point au dernier, soit
   * `N - rang + 1`. N est le nombre de joueurs CLASSÉS de ce tournoi — quand les rangs se suivent
   * de 1 à N, cela revient au nombre de participants tout en garantissant que le dernier obtient
   * exactement 1 point, même si un joueur n'a pas été classé.
   *
   * ⚠️ Agrégation en deux temps. Dans un tournoi multi-tables, un joueur est déplacé de table en
   * table : `gametableplayer` porte alors plusieurs lignes pour lui. Sommer directement compterait
   * ses points autant de fois. On réduit donc d'abord à une ligne par (tournoi, joueur).
   *
   * Seuls les tournois TERMINÉS comptent : un tournoi en cours n'a pas de classement définitif, un
   * tournoi annulé n'a pas eu lieu.
   */
  async generalRanking(organizerId: number) {
    const rows = await this.dataSource.query(`
      SELECT perPlayer.playerId,
             pi.screenname AS screenName,
             COUNT(*)                                             AS tournaments,
             SUM(cnt.nb - perPlayer.finalRank + 1)                AS points,
             SUM(CASE WHEN perPlayer.finalRank = 1 THEN 1 ELSE 0 END) AS wins,
             MIN(perPlayer.finalRank)                             AS bestRank
        FROM (
              -- Une seule ligne par (tournoi, joueur) : neutralise les changements de table.
              -- /!\ L'alias ne peut PAS s'appeler "rank" : mot réservé depuis MySQL 8 (fonction
              -- de fenêtrage RANK()), la requête serait rejetée à l'analyse. La référence
              -- qualifiée gtp.rank, elle, reste valide.
              SELECT t.tournamentid AS tournamentId, ts.playerid AS playerId,
                     MIN(gtp.rank) AS finalRank
                FROM organizerarchetype oa
                JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = oa.tournamentarchetypeid
                JOIN tournament t  ON t.tournamentarchetypeid = ta.tournamentarchetypeid
                JOIN tournamentsubscription ts ON ts.tournamentid = t.tournamentid
                JOIN gametable gt  ON gt.tournamentid = t.tournamentid
                JOIN gametableplayer gtp ON gtp.playerid = ts.playerid
                                        AND gtp.gametableid = gt.gametableid
                                        AND gtp.rank > 0
               WHERE oa.organizerid = ?
                 AND t.gamestate = ${GAME_STATE.ended}
               GROUP BY t.tournamentid, ts.playerid
             ) AS perPlayer
        JOIN (
              -- Nombre de joueurs classés, par tournoi : la base du barème.
              SELECT tournamentId, COUNT(*) AS nb FROM (
                    SELECT t2.tournamentid AS tournamentId, gtp2.playerid AS playerId
                      FROM tournament t2
                      JOIN gametable gt2 ON gt2.tournamentid = t2.tournamentid
                      JOIN gametableplayer gtp2 ON gtp2.gametableid = gt2.gametableid
                                               AND gtp2.rank > 0
                     GROUP BY t2.tournamentid, gtp2.playerid
                   ) AS distinctPlayers
               GROUP BY tournamentId
             ) AS cnt ON cnt.tournamentId = perPlayer.tournamentId
        LEFT JOIN playerinfos pi ON pi.playerid = perPlayer.playerId
       GROUP BY perPlayer.playerId, pi.screenname
       ORDER BY points DESC, wins DESC, tournaments ASC
    `, [organizerId]);

    return rows.map((r: Record<string, unknown>, i: number) => ({
      position: i + 1,
      playerId: Number(r.playerId),
      screenName: r.screenName as string | null,
      tournaments: Number(r.tournaments),
      points: Number(r.points),
      wins: Number(r.wins),
      bestRank: Number(r.bestRank),
    }));
  }

  /** Classement d'un tournoi — l'appartenance est revérifiée, l'id venant du client. */
  async tournamentRanking(organizerId: number, tournamentId: number) {
    const [own] = await this.dataSource.query<{ n: number }[]>(`
      SELECT COUNT(*) AS n
        FROM tournament t
        JOIN organizerarchetype oa ON oa.tournamentarchetypeid = t.tournamentarchetypeid
       WHERE t.tournamentid = ? AND oa.organizerid = ?`,
      [tournamentId, organizerId],
    );
    if (!Number(own?.n)) throw new ForbiddenException('Ce tournoi ne vous appartient pas.');

    // ⚠️ Il n'existe PAS de table `tournamentplayer`. Le classement vit sur `gametableplayer.rank`
    // et les gains sur `wonprize`, relié par `genericsubscription`. Chaîne reprise telle quelle de
    // GenericSubscription.java (requête de l'historique joueur), seule référence fiable ici.
    return this.dataSource.query(`
      SELECT ts.playerid AS playerId, pi.screenname AS screenName,
             gtp.rank, wp.amount AS prizeAmount, p.label AS prizeLabel
        FROM tournamentsubscription ts
        JOIN gametable gt ON gt.tournamentid = ts.tournamentid
        JOIN gametableplayer gtp ON gtp.playerid = ts.playerid
             AND gtp.gametableid = gt.gametableid AND gtp.rank > 0
        LEFT JOIN genericsubscription gs
             ON gs.tournamentsubscriptionid = ts.tournamentsubscriptionid
        LEFT JOIN wonprize wp ON wp.genericsubscriptionid = gs.genericsubscriptionid
        LEFT JOIN prize p ON p.prizeid = wp.prizeid
        LEFT JOIN playerinfos pi ON pi.playerid = ts.playerid
       WHERE ts.tournamentid = ?
       ORDER BY gtp.rank ASC`,
      [tournamentId],
    );
  }

  /**
   * Crée un tournoi pour cet organisateur.
   *
   * L'organisateur ne fournit QUE les champs métier (nom, date, joueurs, code, buy-in) : tous les
   * réglages moteur sont complétés ici avec des valeurs sûres. Ce n'est pas de la commodité —
   * exposer `structureType`, `hasVideo` ou `gameTimeId` à un utilisateur externe lui donnerait les
   * moyens de créer un tournoi qui ne se lance jamais, voire qui fait planter TournamentServer.
   *
   * Les tournois d'organisateur sont TOUJOURS privés par code d'accès (type 4) : c'est le seul
   * mécanisme de confidentialité utilisable ici, `clubid` dépendant de tables absentes.
   */
  async createTournament(organizerId: number, input: {
    label?: string; startAt?: string; maxPlayers?: number; tableSize?: number;
    accessCode?: string; buyIn?: number; cadence?: string; initStack?: number;
    subscriptionMinutes?: number; lastLateRegisterLevel?: number;
  }) {
    const profile = await this.profile(organizerId);

    if (profile.remainingThisMonth !== null && profile.remainingThisMonth <= 0) {
      throw new BadRequestException(
        `Quota atteint : ${profile.maxTournamentsPerMonth} tournoi(s) par période de 30 jours. `
        + "Contactez-nous pour l'augmenter.",
      );
    }
    // Liste blanche : l'interface propose ces valeurs, mais rien n'empêche un client modifié d'en
    // poster d'autres. On revalide donc côté serveur — c'est ce qui garantit qu'un organisateur ne
    // peut pas fabriquer une configuration hors des cas éprouvés.
    const maxPlayers = pick(input.maxPlayers, CLUB_OPTIONS.maxPlayers, 'Nombre de joueurs');
    const tableSize = pick(input.tableSize, CLUB_OPTIONS.tableSize, 'Joueurs par table');
    const buyIn = pick(input.buyIn, CLUB_OPTIONS.buyIn, 'Buy-in');
    const initStack = pick(input.initStack, CLUB_OPTIONS.initStack, 'Stack initial');
    const subscriptionMinutes = pick(
      input.subscriptionMinutes, CLUB_OPTIONS.subscriptionMinutes, 'Ouverture des inscriptions',
    );
    const lastLateRegisterLevel = pick(
      input.lastLateRegisterLevel, CLUB_OPTIONS.lastLateRegisterLevel, 'Inscription tardive',
    );

    if (profile.maxPlayersPerTournament > 0 && maxPlayers > profile.maxPlayersPerTournament) {
      throw new BadRequestException(
        `Votre plafond est de ${profile.maxPlayersPerTournament} joueurs par tournoi.`,
      );
    }
    const gameTimeId = await this.resolveGameTimeId(input.cadence ?? 'normal');
    const blindStructureId = await this.resolveBlindStructureId();

    // Délégation au service partagé : il porte les garde-fous moteur (shootOut refusé, cadence
    // cash game refusée, buy-in plancher, cohérence type/code…). Les dupliquer ici garantirait
    // qu'ils divergent un jour.
    const { id } = await this.archetypes.create({
      label: input.label,
      description: `Tournoi de ${profile.name}`,
      type: 4,                       // privé par code d'accès
      accessCode: input.accessCode,
      periodType: 1,                 // une seule fois : un évènement d'association
      periodStart: input.startAt,
      subscriptionMinutes,
      // Minimum figé à 2 et non exposé : en dessous du minimum le tournoi est annulé, un
      // organisateur n'a aucune raison de vouloir un seuil d'annulation plus haut.
      minPlayers: 2,
      maxPlayers,
      tableSize,
      buyIn,
      // Gratuit → dotation fixe imposée (la génération automatique partirait de zéro).
      // Payant → null, ServersManager génère la structure au premier passage.
      prizeStructureId: buyIn === 0 ? FREE_PRIZE_STRUCTURE_ID : null,
      initStack,
      gameTimeId,
      blindStructureId,
      // Rebuy et addon désactivés : les deux se pilotent par la même colonne, et les proposer
      // exigerait d'expliquer le système de pauses horaires à un organisateur occasionnel.
      addonBreakIndex: 0,
      lastLateRegisterLevel,
      minLevel: 0,
      active: true,
    });

    await this.dataSource.query(
      'INSERT INTO organizerarchetype (organizerid, tournamentarchetypeid) VALUES (?, ?)',
      [organizerId, id],
    );
    return { id };
  }

  /** Cadence choisie par libellé, jamais par identifiant : les ids varient selon l'environnement. */
  private async resolveGameTimeId(cadence: string): Promise<number> {
    const targetMs = cadence === 'turbo' ? 90000 : cadence === 'lent' ? 600000 : 300000;
    const [exact] = await this.dataSource.query<{ id: number }[]>(
      'SELECT gametimeid AS id FROM gametime WHERE leveltime = ? LIMIT 1', [targetMs],
    );
    if (exact) return Number(exact.id);
    // Repli : la cadence la plus proche parmi celles utilisables en tournoi (leveltime > 0).
    const [closest] = await this.dataSource.query<{ id: number }[]>(
      'SELECT gametimeid AS id FROM gametime WHERE leveltime > 0 ORDER BY ABS(leveltime - ?) LIMIT 1',
      [targetMs],
    );
    if (!closest) throw new BadRequestException('Aucune cadence de jeu configurée.');
    return Number(closest.id);
  }

  private async resolveBlindStructureId(): Promise<number> {
    const [row] = await this.dataSource.query<{ id: number }[]>(
      `SELECT blindstructureid AS id FROM blindstructure
        ORDER BY (label LIKE '%SNG%') DESC, blindstructureid ASC LIMIT 1`,
    );
    if (!row) throw new BadRequestException('Aucune structure de blindes configurée.');
    return Number(row.id);
  }

  /**
   * Annule une ÉDITION déjà créée — uniquement si personne n'y est inscrit.
   *
   * ⚠️ La restriction « aucun inscrit » n'est pas du confort : la vraie annulation
   * (TournamentServer.cancelTournament) ferme les inscriptions, passe le tournoi en `canceled`
   * PUIS REMBOURSE chaque inscrit via TournamentM.tryTournamentRefund, dans une transaction.
   * Se contenter des deux UPDATE sur un tournoi ayant des inscrits leur retirerait leur buy-in
   * sans contrepartie — silencieusement. On refuse donc plutôt que de dupliquer ici une logique
   * de remboursement qui touche aux soldes.
   *
   * Sans inscrit, il n'y a rien à rembourser : les deux écritures suffisent et reproduisent
   * exactement l'état posé par le serveur de tournoi.
   */
  async cancelTournamentInstance(organizerId: number, archetypeId: number) {
    const [row] = await this.dataSource.query<{
      tournamentId: number | null; gameState: number | null; subscribers: number;
    }[]>(`
      SELECT t.tournamentid AS tournamentId, t.gamestate AS gameState,
             (SELECT COUNT(*) FROM tournamentsubscription ts
               WHERE ts.tournamentid = t.tournamentid AND ts.subscription = 0) AS subscribers
        FROM organizerarchetype oa
        JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = oa.tournamentarchetypeid
        LEFT JOIN tournament t ON t.tournamentid = (
              SELECT t2.tournamentid FROM tournament t2
               WHERE t2.tournamentarchetypeid = ta.tournamentarchetypeid
               ORDER BY t2.tournamentid DESC LIMIT 1)
       WHERE oa.organizerid = ? AND oa.tournamentarchetypeid = ?`,
      [organizerId, archetypeId],
    );
    if (!row) throw new ForbiddenException('Ce tournoi ne vous appartient pas.');
    if (row.tournamentId == null) {
      throw new BadRequestException("Ce tournoi n'a pas encore d'édition : utilisez la suspension.");
    }
    if (Number(row.gameState) !== GAME_STATE.notStarted) {
      throw new BadRequestException(
        'Ce tournoi est déjà démarré, terminé ou annulé : il ne peut plus être annulé ici.',
      );
    }
    if (Number(row.subscribers) > 0) {
      throw new BadRequestException(
        `${row.subscribers} joueur(s) sont inscrits : l'annulation exige un remboursement et ne `
        + 'peut pas être faite depuis cet écran. Contactez-nous.',
      );
    }

    // Mêmes écritures, et dans le même ordre, que TournamentServer.cancelTournament().
    await this.dataSource.transaction(async (tx) => {
      await tx.query('UPDATE tournament SET subscriptionstate = ? WHERE tournamentid = ?',
        [SUBSCRIPTION_STATE.closed, row.tournamentId]);
      await tx.query('UPDATE tournament SET gamestate = ? WHERE tournamentid = ?',
        [GAME_STATE.canceled, row.tournamentId]);
      // L'archétype `oneTime` s'invalide déjà tout seul une fois l'instance créée ; on le pose
      // explicitement pour qu'aucun passage de ServersManager ne recrée une édition.
      await tx.query('UPDATE tournamentarchetype SET isvalid = 1 WHERE tournamentarchetypeid = ?',
        [archetypeId]);
    });

    return this.myArchetypes(organizerId);
  }

  /** Active/désactive la planification — uniquement sur ses propres archétypes. */
  async setArchetypeActive(organizerId: number, archetypeId: number, active: boolean) {
    const [own] = await this.dataSource.query<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM organizerarchetype WHERE organizerid = ? AND tournamentarchetypeid = ?',
      [organizerId, archetypeId],
    );
    if (!Number(own?.n)) throw new ForbiddenException('Ce tournoi ne vous appartient pas.');

    await this.archetypes.setActive(archetypeId, active);
    return this.myArchetypes(organizerId);
  }
}
