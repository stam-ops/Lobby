import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Valeurs acceptées par ServersManager (cf. campok.client.codes...PeriodType). */
export const PERIOD_TYPE = {
  noPeriod: 0,
  oneTime: 1,
  everyXMinutes: 2,
  everyDay: 3,
  daysOfWeek: 4,
  daysOfMonth: 5,
} as const;

/**
 * Restriction d'accès — cf. ClientCodes/…/tournament/TournamentArchetypeType.java.
 * Appliqué à l'inscription par Bdd/…/meta/TournamentM.tryTournamentSubscription (switch ligne 112).
 *
 * ⚠️ `accessCode` (4) ne privatise PAS le tournoi dans le lobby : il reste listé, seule
 * l'inscription est protégée. La privatisation réelle passe par `clubid`, qui est filtré
 * hors du lobby public (`Tournament.java` : `AND ta.clubid IS NULL`).
 */
export const TOURNAMENT_ARCH_TYPE = {
  classic: 0,
  ladiesOnly: 1,
  vipOnly: 2,
  levelMin: 3,
  accessCode: 4,
} as const;

export interface LookupOption { id: number; label: string }

/** Cadence : on expose la durée brute d'un niveau, l'UI en déduit des repères en minutes. */
export interface GameTimeOption extends LookupOption { levelTimeMs: number }

/** Structure de prix : la plage de joueurs conditionne le versement effectif des gains. */
export interface PrizeStructureOption extends LookupOption {
  minPlayers: number | null;
  maxPlayers: number | null;
  firstPrize: number | null;
  /** Somme versée si tous les rangs payés sont atteints (une tranche 4–6 à 200 compte 600). */
  totalPrize: number;
}

export interface ArchetypeLookups {
  blindStructures: LookupOption[];
  prizeStructures: PrizeStructureOption[];
  gameTimes: GameTimeOption[];
  clubs: LookupOption[];
  /** Structure imposée aux tournois gratuits (cf. FREE_PRIZE_STRUCTURE_ID). */
  freePrizeStructureId: number;
}

/**
 * Dotation des tournois GRATUITS (buy-in 0), où la génération automatique ne s'applique pas.
 *
 * ⚠️ Cet identifiant n'existe dans AUCUN seed : il a été créé dans la base d'exploitation (les
 * structures auto-générées par ServersManager.setArchPrizeStructure s'y ajoutent au fil de l'eau).
 * Il est donc surchargeable par environnement plutôt que codé en dur côté UI — sur une base où il
 * n'existe pas, le menu se retrouverait vide et la création serait bloquée, au lieu de proposer
 * silencieusement une dotation inadaptée.
 */
const FREE_PRIZE_STRUCTURE_ID = Number(process.env.FREE_PRIZE_STRUCTURE_ID ?? 46);

/**
 * Création / édition des archétypes de tournoi (table tournamentarchetype).
 *
 * ⚠️ PIÈGE `isvalid` — la colonne est INVERSÉE par rapport à son nom :
 *   - ServersManager planifie les archétypes via `getArchetypes()` : `WHERE isvalid = 0`.
 *   - `invalidateTournamentArchetype()` fait `SET isvalid = 1` (utilisé après un tournoi oneTime).
 *   Donc 0 = ACTIF (planifié), 1 = DÉSACTIVÉ. Le DEFAULT 0 rend un archétype actif dès sa création.
 *   L'API expose un booléen `active` (= isvalid 0) pour ne pas propager cette ambiguïté.
 *
 * ⚠️ `perioddata` — son format dépend de `periodtype` (cf. ServersManager.computeStartTime) :
 *   - oneTime      : inutilisé, c'est `periodstart` qui fait foi (l'archétype s'auto-désactive après).
 *   - everyXMinutes: un entier de minutes, qui doit vérifier la contrainte de ServersManager.
 *   - everyDay     : inutilisé, +24 h à partir de `periodstart`.
 *   - daysOfWeek   : "1,2@21:00" (1 = lundi … 7 = dimanche), heure Europe/Paris.
 *   - daysOfMonth  : "1,15@20:30" (jours du mois), heure Europe/Paris.
 */
/**
 * Buy-in plancher pour la génération automatique de dotation. En dessous, `buyInMinusRake`
 * (= buyIn * (100 - rake) / 100, division ENTIÈRE) tombe à des montants dérisoires voire nuls.
 * Un tournoi gratuit passe par 0 + structure de prix fixe.
 */
const MIN_BUY_IN = 100;

/** Fuseau de planification, identique à ServersManager (`TimeZone.getTimeZone("Europe/Paris")`). */
const SCHEDULE_TZ = 'Europe/Paris';

/** Offset d'Europe/Paris (en secondes) à un instant UTC donné — DST géré via Intl. */
function parisOffsetSeconds(utcMillis: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMillis))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - utcMillis) / 1000);
}

/**
 * Convertit une heure MURALE Europe/Paris ("YYYY-MM-DDTHH:MM") en secondes epoch.
 *
 * ⚠️ Pourquoi c'est nécessaire : `<input type="datetime-local">` envoie une heure sans fuseau,
 * et `periodstart` est un `TIMESTAMP` MySQL (converti UTC↔session). Sans cette conversion
 * explicite, « 22:15 » était interprété comme UTC et ServersManager (chemin oneTime :
 * `arch.startTime = arch.periodStart`, SANS reconversion Paris) lançait le tournoi 2 h trop tard.
 * On fait donc ici la même hypothèse que le planificateur : l'heure saisie est de l'heure de Paris.
 * Indépendant du fuseau du process Node ET de la session MySQL (on insère via FROM_UNIXTIME).
 */
function parisWallClockToEpochSeconds(local: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) {
    throw new BadRequestException('Date de départ invalide (format attendu AAAA-MM-JJTHH:MM).');
  }
  const [Y, Mo, D, H, Mi, S] = m.slice(1).map((v) => Number(v ?? 0));
  const asIfUtc = Date.UTC(Y, Mo - 1, D, H, Mi, S);
  // Corrige avec l'offset réel ; recalcule une fois pour les bascules d'heure d'été/hiver.
  const off1 = parisOffsetSeconds(asIfUtc);
  let epoch = asIfUtc - off1 * 1000;
  const off2 = parisOffsetSeconds(epoch);
  if (off2 !== off1) epoch = asIfUtc - off2 * 1000;
  return Math.floor(epoch / 1000);
}

/** Epoch secondes → chaîne murale Paris "YYYY-MM-DDTHH:MM:SS" (pour relecture/affichage). */
function epochSecondsToParisWallClock(epochSeconds: number): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(epochSeconds * 1000))) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Durée en ms → « 1 min 30 », « 5 min », « 30 s ». */
function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest}` : `${m} min`;
}

/**
 * Libellé d'une cadence de jeu.
 *
 * ⚠️ Nommé d'après la DURÉE d'un niveau, PAS d'après `gametimeid` : les identifiants ne sont pas
 * stables d'un environnement à l'autre (maindb-init-fbapp.sql crée 3/6/8/10 min sur les mêmes ids
 * 1-4 que seed-maindb.sql, qui crée 10 min / cash game / 1 min 30 / 5 min). Un mapping par id
 * afficherait donc « Turbo » sur une cadence lente selon la base.
 */
function gameTimeLabel(levelTimeMs: number, actionTimeMs: number): string {
  const named = levelTimeMs === 90000 ? 'Turbo'
    : levelTimeMs === 300000 ? 'Normal'
      : levelTimeMs === 600000 ? 'Lent'
        : null;
  const cadence = `niveau ${fmtDuration(levelTimeMs)}`;
  const action = `action ${fmtDuration(actionTimeMs)}`;
  return named ? `${named} — ${cadence} / ${action}` : `${cadence} / ${action}`;
}

interface PrizeRankRow {
  id: number; lo: number | null; hi: number | null;
  minRank: number | null; maxRank: number | null; amount: number | null;
}

/**
 * Agrège les tranches de rangs d'une structure de prix en un libellé lisible et une dotation totale.
 *
 * La dotation totale compte chaque rang de la tranche : une tranche 4–6 à 200 vaut 600. C'est la
 * somme réellement versée si le tournoi atteint le rang le plus bas payé — au-delà du nombre de
 * joueurs présents, les rangs inexistants ne sont simplement pas attribués.
 */
function buildPrizeStructureOptions(rows: PrizeRankRow[]): PrizeStructureOption[] {
  const byId = new Map<number, PrizeRankRow[]>();
  for (const r of rows) {
    const id = Number(r.id);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(r);
  }

  return [...byId.entries()].map(([id, rs]) => {
    const los = rs.map((r) => r.lo).filter((v): v is number => v != null).map(Number);
    const his = rs.map((r) => r.hi).filter((v): v is number => v != null).map(Number);
    const lo = los.length ? Math.min(...los) : null;
    const hi = his.length ? Math.max(...his) : null;

    const ranks = rs.filter((r) => r.minRank != null && r.amount != null);
    const total = ranks.reduce(
      (sum, r) => sum + (Number(r.maxRank) - Number(r.minRank) + 1) * Number(r.amount), 0,
    );
    const first = ranks.find((r) => Number(r.minRank) === 1);

    const players = lo == null ? 'plage inconnue'
      : lo === hi ? `${lo} joueur${lo > 1 ? 's' : ''} exactement`
        : `${lo} à ${hi} joueurs`;

    const breakdown = ranks
      .sort((a, b) => Number(a.minRank) - Number(b.minRank))
      .map((r) => {
        const rank = Number(r.minRank) === Number(r.maxRank)
          ? `${r.minRank}${Number(r.minRank) === 1 ? 'er' : 'e'}`
          : `${r.minRank}–${r.maxRank}`;
        return `${rank} : ${Number(r.amount).toLocaleString('fr-FR')}`;
      })
      .join(' · ');

    const head = ranks.length
      ? `${ranks.length} rang${ranks.length > 1 ? 's' : ''} payé${ranks.length > 1 ? 's' : ''}, total ${total.toLocaleString('fr-FR')}`
      : 'aucun rang payé';

    return {
      id,
      label: `#${id} — ${head} — ${players}${breakdown ? ` (${breakdown})` : ''}`,
      minPlayers: lo,
      maxPlayers: hi,
      firstPrize: first ? Number(first.amount) : null,
      totalPrize: total,
    };
  }).sort((a, b) => a.id - b.id);
}

@Injectable()
export class TournamentArchetypeService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Contrainte exacte de ServersManager pour everyXMinutes : il REJETTE si
   * `60 % m != 0 && m % 60 != 0 && 60 % (m % 60) != 0`. On valide donc l'inverse.
   * Exemples : 15/20/30/60/90/120 passent ; 45 et 7 sont refusés.
   */
  static isValidEveryXMinutes(m: number): boolean {
    if (!Number.isInteger(m) || m <= 0) return false;
    return 60 % m === 0 || m % 60 === 0 || (m % 60 !== 0 && 60 % (m % 60) === 0);
  }

  /** Valide `perioddata` selon le `periodtype`, et renvoie la valeur normalisée à stocker. */
  private validatePeriod(periodType: number, periodData: string): string {
    const d = (periodData ?? '').trim();
    switch (periodType) {
      case PERIOD_TYPE.noPeriod:
      case PERIOD_TYPE.oneTime:
      case PERIOD_TYPE.everyDay:
        return ''; // non utilisé par le planificateur pour ces types
      case PERIOD_TYPE.everyXMinutes: {
        const m = Number(d);
        if (!TournamentArchetypeService.isValidEveryXMinutes(m)) {
          throw new BadRequestException(
            `Intervalle « ${d} » refusé par ServersManager. Utiliser un diviseur de 60 (5, 10, 15, 20, 30), `
            + 'un multiple de 60 (60, 120…), ou un nombre dont le reste modulo 60 divise 60 (ex. 90).',
          );
        }
        return String(m);
      }
      case PERIOD_TYPE.daysOfWeek:
      case PERIOD_TYPE.daysOfMonth: {
        const m = /^(\d+(,\d+)*)@(\d{1,2}):(\d{2})$/.exec(d);
        if (!m) {
          throw new BadRequestException(
            'Format attendu : « jours@HH:MM » (ex. « 1,2@21:00 »).',
          );
        }
        const days = m[1].split(',').map(Number);
        const max = periodType === PERIOD_TYPE.daysOfWeek ? 7 : 31;
        const what = periodType === PERIOD_TYPE.daysOfWeek ? 'jour de semaine (1 = lundi … 7 = dimanche)' : 'jour du mois';
        if (days.some((n) => n < 1 || n > max)) {
          throw new BadRequestException(`Chaque ${what} doit être entre 1 et ${max}.`);
        }
        const h = Number(m[3]); const min = Number(m[4]);
        if (h > 23 || min > 59) throw new BadRequestException('Heure invalide (HH entre 0 et 23, MM entre 0 et 59).');
        return `${days.join(',')}@${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      }
      default:
        throw new BadRequestException(`periodType inconnu : ${periodType}`);
    }
  }

  /** Listes de référence pour les menus déroulants (FK). */
  async lookups(): Promise<ArchetypeLookups> {
    const [blind, prize, time, clubs] = await Promise.all([
      this.dataSource.query<{ id: number; label: string }[]>(
        'SELECT blindstructureid AS id, label FROM blindstructure ORDER BY label',
      ),
      // prizestructure n'a pas de libellé : on le compose à partir du 1er prix et de la plage de
      // joueurs RÉELLEMENT couverte. Cette plage est déterminante : PrizeStructure
      // .getCurrentSubstructureForTournament filtre sur
      // `minplayerscount <= GREATEST(playerscount, minplayers) <= maxplayerscount`, donc une
      // structure hors plage ne distribue AUCUN prix (on l'affiche pour éviter le piège).
      // Une ligne par tranche de rangs : le regroupement se fait en JS pour pouvoir reconstituer
      // la répartition complète (1er, 2e, 4–6…) et la dotation totale, pas seulement le 1er prix.
      this.dataSource.query<{
        id: number; lo: number | null; hi: number | null;
        minRank: number | null; maxRank: number | null; amount: number | null;
      }[]>(`
        SELECT ps.prizestructureid AS id,
               pss.minplayerscount AS lo, pss.maxplayerscount AS hi,
               pssrr.minrank AS minRank, pssrr.maxrank AS maxRank, p.amount
        FROM prizestructure ps
        LEFT JOIN prizesubstructure pss ON pss.prizestructureid = ps.prizestructureid
        LEFT JOIN prizesubstructurerankrange pssrr ON pssrr.prizesubstructureid = pss.prizesubstructureid
        LEFT JOIN prize p ON p.prizeid = pssrr.prizeid
        ORDER BY ps.prizestructureid, pss.minplayerscount, pssrr.minrank
      `),
      // `leveltime = 0` = entrée cash game (les blindes ne montent pas). Elle est ÉCARTÉE ici :
      // TournamentServer.checkLateSubscriptionsEnd divise par `infos.levelTime`, donc un tournoi
      // configuré dessus lèverait une ArithmeticException (/ by zero) à chaque tick.
      this.dataSource.query<{ id: number; leveltime: number; actiontime: number }[]>(
        'SELECT gametimeid AS id, leveltime, actiontime FROM gametime WHERE leveltime > 0 ORDER BY leveltime DESC',
      ),
      this.dataSource.query<{ id: number; label: string }[]>(
        'SELECT clubid AS id, name AS label FROM club ORDER BY name',
      ).catch(() => []), // table club optionnelle selon les environnements
    ]);

    return {
      blindStructures: blind.map((b) => ({ id: Number(b.id), label: b.label || `#${b.id}` })),
      prizeStructures: buildPrizeStructureOptions(prize),
      gameTimes: time.map((g) => ({
        id: Number(g.id),
        label: gameTimeLabel(Number(g.leveltime), Number(g.actiontime)),
        levelTimeMs: Number(g.leveltime),
      })),
      clubs: (clubs as { id: number; label: string }[]).map((c) => ({ id: Number(c.id), label: c.label || `#${c.id}` })),
      freePrizeStructureId: FREE_PRIZE_STRUCTURE_ID,
    };
  }

  async list() {
    const rows = await this.dataSource.query(`
      SELECT ta.tournamentarchetypeid AS id, ta.label, ta.description, ta.type,
             ta.minplayers AS minPlayers, ta.maxplayers AS maxPlayers, ta.tablesize AS tableSize,
             ta.starttype AS startType, ta.periodtype AS periodType, ta.perioddata AS periodData,
             UNIX_TIMESTAMP(ta.periodstart) AS periodStartEpoch,
             ta.timeforsubscriptionsbeforestart AS subscriptionMinutes,
             ta.structuretype AS structureType, ta.buyin AS buyIn,
             ta.addonbreakindex AS addonBreakIndex, ta.lastlateregisterlevel AS lastLateRegisterLevel,
             ta.moneytype AS moneyType, ta.gametype AS gameType, ta.limittype AS limitType,
             ta.blindstructureid AS blindStructureId, ta.prizestructureid AS prizeStructureId,
             ta.initstack AS initStack, ta.gametimeid AS gameTimeId,
             ta.hasvideo AS hasVideo, ta.minlevel AS minLevel, ta.clientid AS clientId,
             ta.clubid AS clubId, ta.clubsendcampoke AS clubSendCampoke, ta.accesscode AS accessCode,
             (ta.isvalid = 0) AS active,
             (SELECT COUNT(*) FROM tournament t WHERE t.tournamentarchetypeid = ta.tournamentarchetypeid) AS tournamentCount
      FROM tournamentarchetype ta
      ORDER BY ta.tournamentarchetypeid DESC
    `);
    return rows.map((r: Record<string, unknown>) => {
      const epoch = r.periodStartEpoch == null ? null : Number(r.periodStartEpoch);
      const { periodStartEpoch, ...rest } = r;
      void periodStartEpoch;
      return {
        ...rest,
        // Renvoyée en heure murale Paris pour réafficher exactement ce qui a été saisi.
        periodStart: epoch && epoch > 0 ? epochSecondsToParisWallClock(epoch) : null,
        active: Number(r.active) === 1,
        clubSendCampoke: Number(r.clubSendCampoke) === 1,
        tournamentCount: Number(r.tournamentCount),
      };
    });
  }

  /** Colonnes acceptées à la création (whitelist) — `isvalid` est piloté via `active`. */
  async create(body: Record<string, unknown>) {
    const num = (v: unknown, def = 0) => {
      const n = Number(v ?? def);
      if (!Number.isInteger(n) || n < 0) throw new BadRequestException('Valeur numérique invalide');
      return n;
    };

    const label = String(body.label ?? '').trim();
    if (!label) throw new BadRequestException('Le libellé est requis');

    const periodType = num(body.periodType);
    const periodData = this.validatePeriod(periodType, String(body.periodData ?? ''));

    const minPlayers = num(body.minPlayers, 2);
    const maxPlayers = num(body.maxPlayers, 1000000);
    const tableSize = num(body.tableSize, 10);
    if (minPlayers < 2) throw new BadRequestException('minPlayers doit être >= 2');
    if (maxPlayers < minPlayers) throw new BadRequestException('maxPlayers doit être >= minPlayers');
    if (tableSize < 2) throw new BadRequestException('tableSize doit être >= 2');

    const blindStructureId = num(body.blindStructureId);
    const gameTimeId = num(body.gameTimeId);
    if (!blindStructureId) throw new BadRequestException('Structure de blindes requise');
    if (!gameTimeId) throw new BadRequestException('Game time requis');

    // Un gametime à `leveltime = 0` est une entrée CASH GAME : TournamentServer divise par
    // `infos.levelTime` pour calculer le niveau courant, donc le thread du tournoi lèverait une
    // ArithmeticException à chaque tick. On le refuse plutôt que de laisser créer un tournoi mortel.
    const [gt] = await this.dataSource.query<{ leveltime: number }[]>(
      'SELECT leveltime FROM gametime WHERE gametimeid = ?',
      [gameTimeId],
    );
    if (!gt) throw new BadRequestException(`Game time ${gameTimeId} introuvable`);
    if (Number(gt.leveltime) <= 0) {
      throw new BadRequestException(
        `Game time ${gameTimeId} a une durée de niveau nulle (entrée cash game) : inutilisable pour `
        + 'un tournoi, TournamentServer planterait sur une division par zéro.',
      );
    }

    // periodstart : requis pour oneTime / everyXMinutes / everyDay (point de départ du calcul).
    // On interprète l'heure saisie en Europe/Paris (comme ServersManager) et on stocke l'instant
    // absolu en secondes epoch — inséré via FROM_UNIXTIME pour ne pas dépendre du fuseau de session.
    const needsStart = [PERIOD_TYPE.oneTime, PERIOD_TYPE.everyXMinutes, PERIOD_TYPE.everyDay]
      .includes(periodType as 1 | 2 | 3);
    const periodStartEpoch = body.periodStart
      ? parisWallClockToEpochSeconds(String(body.periodStart))
      : null;
    if (needsStart && periodStartEpoch == null) {
      throw new BadRequestException('Date de départ (periodStart) requise pour ce type de périodicité');
    }

    // `type` et ses colonnes compagnes doivent être cohérents, sinon le tournoi part cassé :
    // TournamentM.tryTournamentSubscription échoue FERMÉ sur un type 4 sans accesscode
    // (badAccessCode), ce qui rend le tournoi visible dans le lobby mais impossible à rejoindre.
    const type = num(body.type);
    if (type > TOURNAMENT_ARCH_TYPE.accessCode) {
      throw new BadRequestException(`Type d'accès inconnu : ${type}`);
    }
    const accessCode = body.accessCode ? String(body.accessCode).trim().slice(0, 32) : null;
    if (type === TOURNAMENT_ARCH_TYPE.accessCode && !accessCode) {
      throw new BadRequestException(
        "Un tournoi privé (type « Code d'accès ») exige un code : sans lui, aucune inscription n'est possible.",
      );
    }
    if (type !== TOURNAMENT_ARCH_TYPE.accessCode && accessCode) {
      throw new BadRequestException(
        "Un code d'accès n'est lu que par le type « Code d'accès » : il serait ignoré ici.",
      );
    }
    const minLevel = num(body.minLevel);
    if (type === TOURNAMENT_ARCH_TYPE.levelMin && minLevel < 1) {
      throw new BadRequestException('Le type « Niveau minimum » exige un niveau >= 1.');
    }

    // ⚠️ `timeforsubscriptionsbeforestart` est en MINUTES, pas en secondes : Tournament.java
    // teste `now > start - subTime * 60 * 1000`. Le nom de colonne ne le dit pas.
    const subscriptionMinutes = num(body.subscriptionMinutes, 60);

    // structuretype shootOut (1) est INCOMPLET côté serveur : ServersManager.setArchPrizeStructure
    // fait `case StructureType.shootOut: // TODO return false`, donc l'archétype n'est JAMAIS
    // instancié et boucle en log SEVERE. On n'accepte que classic tant que ce n'est pas implémenté.
    const structureType = num(body.structureType);
    if (structureType !== 0) {
      throw new BadRequestException(
        'Seule la structure « Classique » est supportée : le mode shootOut n\'est pas implémenté '
        + 'dans ServersManager (l\'archétype ne serait jamais instancié).',
      );
    }

    // hasvideo = 2 (optionnelle) n'a AUCUNE ligne dans `tournamentrake` : le rake tombe à 0, ce qui
    // fait échouer ServersManager.setArchPrizeStructure et gonfle les prize pools sur l'autre chemin.
    const hasVideo = num(body.hasVideo, 1);
    if (hasVideo === 2) {
      throw new BadRequestException(
        'Vidéo « optionnelle » (2) non supportée pour un tournoi : aucune ligne `tournamentrake` '
        + 'n\'existe pour cette valeur, le rake tomberait à 0.',
      );
    }

    // Un addon est déclenché par un BREAK, et les SNG (starttype 0) ne prennent jamais de break
    // (TournamentServer : `if (startType != maxPlayersReached) checkBreak()`). Un addonbreakindex
    // non nul sur un SNG bloque donc `areAddonsDone()` pour toujours → la structure de prix n'est
    // jamais figée et le tournoi ne peut pas se terminer.
    const startType = num(body.startType, 1);
    const addonBreakIndex = num(body.addonBreakIndex);
    if (startType === 0 && addonBreakIndex > 0) {
      throw new BadRequestException(
        'Un SNG (démarrage « max joueurs atteint ») ne prend jamais de break : un palier d\'addon '
        + 'non nul empêcherait définitivement la clôture du tournoi. Mettre 0.',
      );
    }

    // Buy-in ↔ structure de prix : ServersManager ne génère une structure que si `prizestructureid`
    // est NULL, et le calcul part de `buyInMinusRake = buyIn * (100 - rake) / 100`. Avec un buy-in
    // nul (ou trop faible) la dotation générée est nulle : le tournoi tourne sans prix. Un tournoi
    // gratuit doit donc pointer une structure FIXE, choisie explicitement.
    const buyIn = num(body.buyIn);
    const prizeStructureId = body.prizeStructureId ? num(body.prizeStructureId) : null;
    if (buyIn === 0 && prizeStructureId == null) {
      throw new BadRequestException(
        'Un tournoi gratuit (buy-in 0) exige une structure de prix fixe : la génération automatique '
        + 'partirait d\'une dotation nulle.',
      );
    }
    if (buyIn === 0 && prizeStructureId !== FREE_PRIZE_STRUCTURE_ID) {
      throw new BadRequestException(
        `Un tournoi gratuit doit utiliser la structure de prix ${FREE_PRIZE_STRUCTURE_ID} `
        + `(reçu : ${prizeStructureId}).`,
      );
    }
    if (body.clubId) {
      throw new BadRequestException(
        'Les tournois de club ne sont pas exploitables : les tables `club`/`clubplayer` sont absentes, '
        + "l'inscription échouerait. Utiliser le type « Code d'accès » pour un tournoi privé.",
      );
    }
    if (buyIn > 0 && buyIn < MIN_BUY_IN) {
      throw new BadRequestException(
        `Buy-in trop faible : ${MIN_BUY_IN} minimum, sinon la dotation générée s'effondre à zéro `
        + 'après déduction du rake. Utiliser 0 avec une structure de prix fixe pour un tournoi gratuit.',
      );
    }

    // Une structure fixe ne verse des prix que si le nombre de joueurs tombe dans sa plage
    // (`minplayerscount <= GREATEST(playerscount, minplayers) <= maxplayerscount`). Hors plage, le
    // tournoi se joue et ne paie personne — on refuse la config plutôt que de la laisser passer.
    if (prizeStructureId != null) {
      const [ps] = await this.dataSource.query<{ lo: number | null; hi: number | null }[]>(
        `SELECT MIN(minplayerscount) AS lo, MAX(maxplayerscount) AS hi
           FROM prizesubstructure WHERE prizestructureid = ?`,
        [prizeStructureId],
      );
      if (!ps || ps.lo == null) {
        throw new BadRequestException(
          `Structure de prix ${prizeStructureId} sans sous-structure : elle ne verserait aucun gain.`,
        );
      }
      const lo = Number(ps.lo); const hi = Number(ps.hi);
      // Le serveur évalue GREATEST(playerscount, minplayers) : la borne basse est donc minPlayers,
      // et la table peut monter jusqu'à maxPlayers.
      if (minPlayers > hi || maxPlayers < lo) {
        throw new BadRequestException(
          `Structure de prix ${prizeStructureId} prévue pour ${lo}–${hi} joueurs, incompatible avec `
          + `${minPlayers}–${maxPlayers} : aucun gain ne serait versé.`,
        );
      }
    }

    const active = body.active === undefined ? true : !!body.active;

    const res = await this.dataSource.query(
      `INSERT INTO tournamentarchetype
        (label, description, minplayers, maxplayers, tablesize, starttype, periodtype, perioddata,
         periodstart, timeforsubscriptionsbeforestart, structuretype, buyin, addonbreakindex,
         lastlateregisterlevel, moneytype, gametype, limittype, blindstructureid, prizestructureid,
         initstack, gametimeid, hasvideo, isvalid, type, minlevel, clubid, clubsendcampoke, accesscode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        label.slice(0, 200),
        String(body.description ?? '').slice(0, 2000),
        minPlayers, maxPlayers, tableSize,
        startType, periodType, periodData,
        // FROM_UNIXTIME(NULL) = NULL : instant absolu, insensible au fuseau de session MySQL.
        periodStartEpoch, subscriptionMinutes,
        structureType, buyIn, addonBreakIndex,
        num(body.lastLateRegisterLevel), num(body.moneyType, 1), num(body.gameType), num(body.limitType),
        blindStructureId,
        prizeStructureId,
        num(body.initStack), gameTimeId, hasVideo,
        active ? 0 : 1, // ⚠️ inversé : 0 = actif
        type, minLevel,
        // ⚠️ `clubid` est FORCÉ à NULL : les tables `club`/`clubplayer` n'existent pas sur cette
        // base, alors que TournamentM.tryTournamentSubscription appelle Club.playerIsClubMember dès
        // que clubId != 0 — l'inscription échouerait sur une erreur SQL, et le tournoi serait en
        // plus masqué du lobby (`AND ta.clubid IS NULL`). Pour un tournoi privé, utiliser le type
        // « Code d'accès » (4), qui ne dépend d'aucune table manquante.
        null,
        0,
        accessCode,
      ],
    );
    return { id: Number(res?.insertId ?? 0) };
  }

  /** Active / désactive un archétype (traduit en isvalid inversé). */
  async setActive(id: number, active: boolean) {
    const res = await this.dataSource.query(
      'UPDATE tournamentarchetype SET isvalid = ? WHERE tournamentarchetypeid = ?',
      [active ? 0 : 1, id],
    );
    if (!res?.affectedRows) throw new NotFoundException(`Archétype ${id} introuvable`);
    return this.list();
  }
}
