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

export interface ArchetypeLookups {
  blindStructures: LookupOption[];
  prizeStructures: LookupOption[];
  gameTimes: LookupOption[];
  clubs: LookupOption[];
}

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
      // prizestructure n'a pas de libellé : on compose à partir de son type.
      this.dataSource.query<{ id: number; type: number }[]>(
        'SELECT prizestructureid AS id, type FROM prizestructure ORDER BY prizestructureid',
      ),
      this.dataSource.query<{ id: number; leveltime: number; actiontime: number }[]>(
        'SELECT gametimeid AS id, leveltime, actiontime FROM gametime ORDER BY gametimeid',
      ),
      this.dataSource.query<{ id: number; label: string }[]>(
        'SELECT clubid AS id, name AS label FROM club ORDER BY name',
      ).catch(() => []), // table club optionnelle selon les environnements
    ]);

    return {
      blindStructures: blind.map((b) => ({ id: Number(b.id), label: b.label || `#${b.id}` })),
      prizeStructures: prize.map((p) => ({ id: Number(p.id), label: `#${p.id} (type ${p.type})` })),
      gameTimes: time.map((g) => ({
        id: Number(g.id),
        label: `#${g.id} — niveau ${Math.round(Number(g.leveltime) / 1000)}s / action ${Math.round(Number(g.actiontime) / 1000)}s`,
      })),
      clubs: (clubs as { id: number; label: string }[]).map((c) => ({ id: Number(c.id), label: c.label || `#${c.id}` })),
    };
  }

  async list() {
    const rows = await this.dataSource.query(`
      SELECT ta.tournamentarchetypeid AS id, ta.label, ta.description, ta.type,
             ta.minplayers AS minPlayers, ta.maxplayers AS maxPlayers, ta.tablesize AS tableSize,
             ta.starttype AS startType, ta.periodtype AS periodType, ta.perioddata AS periodData,
             ta.periodstart AS periodStart, ta.timeforsubscriptionsbeforestart AS subscriptionMinutes,
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
    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      active: Number(r.active) === 1,
      clubSendCampoke: Number(r.clubSendCampoke) === 1,
      tournamentCount: Number(r.tournamentCount),
    }));
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

    // periodstart : requis pour oneTime / everyXMinutes / everyDay (point de départ du calcul).
    const periodStart = body.periodStart ? String(body.periodStart) : null;
    if ([PERIOD_TYPE.oneTime, PERIOD_TYPE.everyXMinutes, PERIOD_TYPE.everyDay].includes(periodType as 1 | 2 | 3)
        && !periodStart) {
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

    const active = body.active === undefined ? true : !!body.active;

    const res = await this.dataSource.query(
      `INSERT INTO tournamentarchetype
        (label, description, minplayers, maxplayers, tablesize, starttype, periodtype, perioddata,
         periodstart, timeforsubscriptionsbeforestart, structuretype, buyin, addonbreakindex,
         lastlateregisterlevel, moneytype, gametype, limittype, blindstructureid, prizestructureid,
         initstack, gametimeid, hasvideo, isvalid, type, minlevel, clubid, clubsendcampoke, accesscode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        label.slice(0, 200),
        String(body.description ?? '').slice(0, 2000),
        minPlayers, maxPlayers, tableSize,
        startType, periodType, periodData,
        periodStart, subscriptionMinutes,
        structureType, num(body.buyIn), addonBreakIndex,
        num(body.lastLateRegisterLevel), num(body.moneyType, 1), num(body.gameType), num(body.limitType),
        blindStructureId,
        body.prizeStructureId ? num(body.prizeStructureId) : null,
        num(body.initStack), gameTimeId, hasVideo,
        active ? 0 : 1, // ⚠️ inversé : 0 = actif
        type, minLevel,
        body.clubId ? num(body.clubId) : null,
        body.clubSendCampoke ? 1 : 0,
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
