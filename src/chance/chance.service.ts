import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { MailService } from '../organizers/mail.service';
import { CaptchaService } from '../organizers/captcha.service';
import { MailjetService } from './mailjet.service';
import { FcmService } from './fcm.service';
import { VipWebService, type VipPlan } from './vip-web.service';
import { AnalyseWebService, type AnalysePlan } from './analyse-web.service';
import { CHANCE_LINK_NOTIF_TYPE, chanceTable } from './chance-db';
import { ActionRow, CAMPOK_HANDS_MAX, CardRow, HandRow, SeatRow, campokHand } from './campok-hands';
import { ChanceMail, deleteMail, loginMail, noAccountMail, signupMail } from './chance-mails';

/** Durée de validité d'un lien ou d'un code reçu par e-mail. */
export const LINK_TTL_MINUTES = 15;
/** Essais de code à 6 chiffres par e-mail envoyé. */
export const CODE_ATTEMPTS = 5;
/** E-mails par adresse et par heure : au-delà, la demande est ignorée sans le dire. */
export const PER_EMAIL_HOUR = 3;
/** Demandes par adresse IP du visiteur et par heure : au-delà, 429. */
export const PER_IP_HOUR = 10;
/** Durée d'une session, prolongée à chaque visite (au plus une fois par jour). */
export const SESSION_DAYS = 30;
const REFRESH_AFTER_S = 24 * 3600;
const SESSION_PURPOSE = 'chance-session';
const SECRET_MIN = 32;
const SITE_TIMEOUT_MS = 8000;          // fiche du backoffice : lecture du service public

/** Liaison Campok (offre 2) : validité du code reçu dans l'app, essais, limites. */
export const LINK_CODE_MINUTES = 10;
/** Demandes de code par compte du Chance-o-mètre et par heure : au-delà, 429. */
export const LINK_PER_USER_HOUR = 5;
/** Codes envoyés à un même joueur Campok par heure : au-delà, rien n'est envoyé (sans le dire). */
export const LINK_PER_PLAYER_HOUR = 3;

const LINK_SENT = {
  message: `Si ce pseudo existe, ton code de liaison s’affiche dans les notifications de l’app Campok (valable ${LINK_CODE_MINUTES} minutes).`,
};
const BAD_CODE = 'Code invalide ou expiré : demande un nouveau code.';

/** Réponse identique que l'adresse ait un compte, n'en ait pas ou ait atteint sa limite. */
const SENT = { message: 'Si l’adresse est valide, un e-mail vient de t’être envoyé.' };
const EMAIL_TAKEN = 'Désolé, cet e-mail est déjà associé à un compte.';
const BAD_LINK = 'Lien ou code invalide ou expiré : demande un nouveau lien.';
const BAD_SESSION = 'Session expirée : reconnecte-toi.';

interface UserRow {
  chanceuserid: number;
  email: string;
  newsletter: number;
  playerid: number | null;
  sessionversion: number;
  creationts: Date;
}

export interface ChanceProfile {
  id: number; email: string; creationTs: Date; newsletter: boolean; campok: boolean;
  /** Pseudo du compte Campok relié (offre 2), null sinon. */
  campokName: string | null;
  /** Joueur Campok relié VIP en ce moment (accounttype 1, endvipts dans le futur) : ouverture des mains Campok sans limite. */
  vip: boolean;
  /** Fin du VIP (ISO), null sans VIP. */
  vipUntil: string | null;
  /** Abonnement VIP pris sur le Chance-o-mètre : 'active' (renouvelé chaque mois), 'canceled' (résilié), null sinon. */
  vipSub: 'active' | 'canceled' | null;
  /** Vente du VIP ouverte (clés Stripe présentes). */
  vipShop: boolean;
  /** Offre Analyse du Chance-o-mètre en cours (salles ANJ sans limite), sans besoin de compte Campok relié. */
  analyse: boolean;
  /** Fin de l'offre Analyse (ISO), null sans l'offre. */
  analyseUntil: string | null;
  /** Abonnement de l'offre Analyse : 'active', 'canceled' (résilié), null (pack de 12 mois, ou pas d'offre). */
  analyseSub: 'active' | 'canceled' | null;
  /** Vente de l'offre Analyse ouverte (clés Stripe présentes, sql/004 passé). */
  analyseShop: boolean;
}

export function normEmail(email: unknown): string {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (e.length > 190 || !/^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(e)) {
    throw new BadRequestException('Adresse e-mail invalide.');
  }
  return e;
}

/**
 * Comptes du Chance-o-mètre (voir sql/002_chance.sql et docs/offres.md de stampok).
 *
 * Appelé UNIQUEMENT par le serveur du Chance-o-mètre (audience 'partner'), qui relaie ses visiteurs :
 * il passe l'adresse IP du visiteur (limites) et sa session (en-tête X-Chance-Session).
 *
 * - Connexion sans mot de passe : lien à usage unique (et code à 6 chiffres pour un autre appareil),
 *   valable 15 minutes. Le compte n'est créé qu'au premier clic : une adresse jamais confirmée ne
 *   laisse aucun compte.
 * - Session : JWT signé avec CHANCE_SESSION_SECRET (JAMAIS JWT_SECRET : un jeton de joueur ne doit
 *   pas pouvoir passer pour un jeton du backoffice), 30 jours, prolongé par /chance/me. Révoqué par
 *   « Se déconnecter partout » (sessionversion) ou la suppression du compte (relu à chaque appel).
 * - Liens et codes : seules leurs empreintes HMAC (CHANCE_TOKEN_SECRET) sont en base.
 */
@Injectable()
export class ChanceService {
  private readonly logger = new Logger(ChanceService.name);
  private readonly users: string;
  private readonly logins: string;
  private readonly links: string;
  private readonly tokenSecret: string;
  private readonly sessionSecret: string;
  private readonly publicUrl: string;
  private readonly partnerKey: string;
  // CHANCE_MAIL_FROM : expéditeur des e-mails du Chance-o-mètre (« Chance-o-mètre <adresse> »), MAIL_FROM sinon.
  private readonly mailFrom: string | undefined;
  private readonly ready: boolean;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly mailjet: MailjetService,
    private readonly captcha: CaptchaService,
    private readonly fcm: FcmService,
    private readonly vipWeb: VipWebService,
    private readonly analyseWeb: AnalyseWebService,
    config: ConfigService,
  ) {
    this.users = chanceTable(config, 'chanceuser');
    this.logins = chanceTable(config, 'chancelogin');
    this.links = chanceTable(config, 'chancelink');
    this.tokenSecret = config.get<string>('CHANCE_TOKEN_SECRET', '');
    this.sessionSecret = config.get<string>('CHANCE_SESSION_SECRET', '');
    this.publicUrl = config.get<string>('CHANCE_PUBLIC_URL', 'http://localhost:5174').replace(/\/+$/, '');
    this.partnerKey = config.get<string>('CHANCE_PARTNER_KEY', '');
    this.mailFrom = config.get<string>('CHANCE_MAIL_FROM', '').trim() || undefined;
    const jwtSecret = config.get<string>('JWT_SECRET', '');
    this.ready = this.tokenSecret.length >= SECRET_MIN && this.sessionSecret.length >= SECRET_MIN
      && this.tokenSecret !== this.sessionSecret && this.sessionSecret !== jwtSecret;
    if (!this.ready) {
      this.logger.error(
        'Comptes du Chance-o-mètre fermés : CHANCE_TOKEN_SECRET et CHANCE_SESSION_SECRET doivent faire '
        + `${SECRET_MIN} caractères au moins, être différents l'un de l'autre et de JWT_SECRET.`,
      );
    }
  }

  // ─── Connexion ────────────────────────────────────────────────────────────────────────────────

  /**
   * Demande de lien. `signup` : création de compte (18 ans ou plus obligatoire, nouvelles facultatives).
   * Adresse sans compte et sans `signup` : e-mail « aucun compte », même réponse pour la page.
   * Création pour une adresse qui a déjà un compte : 409 sans e-mail (la page propose de se connecter) ; la demande
   * compte quand même dans la limite par adresse IP.
   */
  async requestLogin(dto: {
    email: string; ip: string; captchaToken?: string; signup?: boolean; adult?: boolean; newsletter?: boolean;
  }) {
    this.check();
    const email = normEmail(dto.email);
    const ip = String(dto.ip ?? '').slice(0, 45);
    if (dto.signup && dto.adult !== true) {
      throw new BadRequestException('Le compte est réservé aux personnes majeures.');
    }
    if (!(await this.captcha.verify(dto.captchaToken, ip))) {
      throw new BadRequestException('Vérification anti-robot échouée. Merci de réessayer.');
    }
    await this.purge();
    await this.limitIp(ip);
    const [user] = await this.dataSource.query<{ id: number }[]>(
      `SELECT chanceuserid AS id FROM ${this.users} WHERE email = ?`, [email],
    );
    if (user && dto.signup) {
      await this.dataSource.query(
        `INSERT INTO ${this.logins} (email, purpose, ip, expirests) VALUES (?, 'none', ?, NOW())`, [email, ip],
      );
      throw new ConflictException(EMAIL_TAKEN);
    }
    if (!(await this.underEmailLimit(email))) return SENT;

    const purpose = user ? 'login' : dto.signup ? 'signup' : 'none';
    if (purpose === 'none') {
      await this.dataSource.query(
        `INSERT INTO ${this.logins} (email, purpose, ip, expirests) VALUES (?, 'none', ?, NOW())`, [email, ip],
      );
      await this.send(email, noAccountMail(`${this.publicUrl}/chance-o-metre`));
      return SENT;
    }
    const token = randomBytes(32).toString('base64url');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.dataSource.query(
      `INSERT INTO ${this.logins} (email, purpose, tokenhash, codehash, newsletter, ip, expirests)
       VALUES (?, ?, ?, ?, ?, ?, NOW() + INTERVAL ${LINK_TTL_MINUTES} MINUTE)`,
      [email, purpose, this.hmac(`t:${token}`), this.hmac(`c:${email}:${code}`),
        purpose === 'signup' && dto.newsletter === true ? 1 : 0, ip],
    );
    const link = `${this.publicUrl}/compte/connexion?t=${token}`;
    await this.send(email, purpose === 'signup' ? signupMail(link, code) : loginMail(link, code));
    return SENT;
  }

  /** Lien (`token`) ou code (`email` + `code`) → session. Crée le compte à la première confirmation. */
  async confirmLogin(dto: { token?: string; email?: string; code?: string }) {
    this.check();
    if (!dto.token && !(dto.email && dto.code)) throw new BadRequestException(BAD_LINK);
    const email = dto.token ? null : normEmail(dto.email);

    // Pas d'exception dans la transaction : un code faux doit quand même compter comme un essai.
    const done = await this.dataSource.transaction(async (tx) => {
      let row: { id: number; email: string; purpose: string; newsletter: number; codehash?: string } | undefined;
      if (dto.token) {
        [row] = await tx.query(
          `SELECT chanceloginid AS id, email, purpose, newsletter FROM ${this.logins}
           WHERE tokenhash = ? AND purpose IN ('login', 'signup') AND usedts IS NULL AND expirests > NOW()
           FOR UPDATE`,
          [this.hmac(`t:${dto.token}`)],
        );
      } else {
        // Dernier e-mail encore valable pour cette adresse : 5 essais, puis il faut un nouveau lien.
        [row] = await tx.query(
          `SELECT chanceloginid AS id, email, purpose, newsletter, codehash FROM ${this.logins}
           WHERE email = ? AND purpose IN ('login', 'signup') AND usedts IS NULL AND expirests > NOW()
             AND attempts < ${CODE_ATTEMPTS}
           ORDER BY chanceloginid DESC LIMIT 1 FOR UPDATE`,
          [email],
        );
        if (row) {
          await tx.query(`UPDATE ${this.logins} SET attempts = attempts + 1 WHERE chanceloginid = ?`, [row.id]);
          if (!this.same(row.codehash, this.hmac(`c:${email}:${dto.code}`))) row = undefined;
        }
      }
      if (!row) return null;
      // Un seul lien utile : tous ceux encore en attente pour cette adresse tombent avec celui-ci.
      await tx.query(
        `UPDATE ${this.logins} SET usedts = NOW()
         WHERE email = ? AND purpose IN ('login', 'signup') AND usedts IS NULL`,
        [row.email],
      );
      let user = await this.userByEmail(tx, row.email);
      let created = false;
      if (!user) {
        if (row.purpose !== 'signup') return null; // compte supprimé entre la demande et le clic
        await tx.query(
          `INSERT INTO ${this.users} (email, adult, newsletter, newsletterts)
           VALUES (?, 1, ?, ${row.newsletter ? 'NOW()' : 'NULL'})`,
          [row.email, row.newsletter ? 1 : 0],
        );
        user = await this.userByEmail(tx, row.email);
        created = true;
      }
      await tx.query(`UPDATE ${this.users} SET lastlogints = NOW() WHERE chanceuserid = ?`, [user.chanceuserid]);
      return { user, created };
    });
    if (!done) throw new BadRequestException(BAD_LINK);
    if (done.created && done.user.newsletter) await this.mailjet.subscribe(done.user.email);
    return { session: await this.sign(done.user), user: await this.profile(done.user), created: done.created };
  }

  // ─── Compte (session du visiteur) ─────────────────────────────────────────────────────────────

  /** Profil ; `session` renouvelée (30 jours de plus) si la précédente a plus d'un jour. */
  async me(session: string | undefined) {
    const { user, iat } = await this.fromSession(session);
    if (Date.now() / 1000 - iat < REFRESH_AFTER_S) return { user: await this.profile(user) };
    await this.dataSource.query(`UPDATE ${this.users} SET lastlogints = NOW() WHERE chanceuserid = ?`, [user.chanceuserid]);
    return { user: await this.profile(user), session: await this.sign(user) };
  }

  async update(session: string | undefined, dto: { newsletter: boolean }) {
    const { user } = await this.fromSession(session);
    const wanted = dto.newsletter === true;
    if (wanted !== !!user.newsletter) {
      await this.dataSource.query(
        `UPDATE ${this.users} SET newsletter = ?, newsletterts = NOW() WHERE chanceuserid = ?`,
        [wanted ? 1 : 0, user.chanceuserid],
      );
      await (wanted ? this.mailjet.subscribe(user.email) : this.mailjet.unsubscribe(user.email));
      user.newsletter = wanted ? 1 : 0;
    }
    return { user: await this.profile(user) };
  }

  // ─── Liaison au compte Campok (offre 2) ───────────────────────────────────────────────────────

  /**
   * Demande de code : notification interne (type chanceLink) insérée pour le joueur Campok de ce pseudo,
   * avec le code ; push en plus si son téléphone l'accepte. Réponse identique que le pseudo existe ou non.
   * Une nouvelle demande annule les précédentes du même compte (leurs notifications disparaissent).
   */
  async requestCampokLink(session: string | undefined, dto: { pseudo: string; ip: string }) {
    const { user } = await this.fromSession(session);
    if (user.playerid != null) {
      throw new HttpException('Ton compte est déjà relié à un compte Campok : délie-le d’abord.', HttpStatus.CONFLICT);
    }
    const pseudo = String(dto.pseudo ?? '').trim();
    if (!pseudo || pseudo.length > 50) throw new BadRequestException('Pseudo Campok invalide.');
    const ip = String(dto.ip ?? '').slice(0, 45);
    await this.purge();
    const tooMany = 'Trop de demandes : réessaie dans une heure.';
    if (ip && (await this.countLinks('ip = ?', [ip])) >= PER_IP_HOUR) throw new HttpException(tooMany, HttpStatus.TOO_MANY_REQUESTS);
    if ((await this.countLinks('chanceuserid = ?', [user.chanceuserid])) >= LINK_PER_USER_HOUR) {
      throw new HttpException(tooMany, HttpStatus.TOO_MANY_REQUESTS);
    }

    const player = await this.playerByPseudo(pseudo);
    // Pas plus de quelques codes par heure chez un même joueur, quel que soit le demandeur : on ne remplit
    // pas les notifications de quelqu'un dont on connaît le pseudo.
    const send = player != null && (await this.countLinks('playerid = ? AND code IS NOT NULL', [player.playerid])) < LINK_PER_PLAYER_HOUR;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.dataSource.transaction(async (tx) => {
      await this.dropPendingLinks(tx, user.chanceuserid);
      let notificationId: number | null = null;
      if (send) {
        const r = await tx.query(
          'INSERT INTO notification (notificationtype, playerid) VALUES (?, ?)', [CHANCE_LINK_NOTIF_TYPE, player.playerid],
        );
        notificationId = Number(r.insertId);
      }
      await tx.query(
        `INSERT INTO ${this.links} (chanceuserid, playerid, code, notificationid, ip, expirests)
         VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ${LINK_CODE_MINUTES} MINUTE)`,
        [user.chanceuserid, player?.playerid ?? null, send ? code : null, notificationId, ip],
      );
    });
    if (send) await this.pushLinkCode(player.playerid, code);
    return LINK_SENT;
  }

  /** Code tapé sur la page → compte relié. Le joueur passe d'un compte à l'autre s'il était déjà relié ailleurs. */
  async confirmCampokLink(session: string | undefined, dto: { code: string }) {
    const { user } = await this.fromSession(session);
    // Pas d'exception dans la transaction : un code faux doit quand même compter comme un essai.
    const linked = await this.dataSource.transaction(async (tx) => {
      const [row] = await tx.query<{ id: number; playerid: number; code: string; notificationid: number | null; attempts: number }[]>(
        `SELECT chancelinkid AS id, playerid, code, notificationid, attempts FROM ${this.links}
         WHERE chanceuserid = ? AND usedts IS NULL AND code IS NOT NULL AND expirests > NOW()
           AND attempts < ${CODE_ATTEMPTS}
         ORDER BY chancelinkid DESC LIMIT 1 FOR UPDATE`,
        [user.chanceuserid],
      );
      if (!row) return false;
      const ok = typeof dto.code === 'string' && dto.code.length === 6
        && timingSafeEqual(Buffer.from(dto.code), Buffer.from(String(row.code)));
      if (!ok) {
        await tx.query(`UPDATE ${this.links} SET attempts = attempts + 1 WHERE chancelinkid = ?`, [row.id]);
        if (Number(row.attempts) + 1 >= CODE_ATTEMPTS) await this.dropPendingLinks(tx, user.chanceuserid);
        return false;
      }
      await tx.query(
        `UPDATE ${this.users} SET playerid = NULL, linkts = NULL WHERE playerid = ? AND chanceuserid <> ?`,
        [row.playerid, user.chanceuserid],
      );
      await tx.query(
        `UPDATE ${this.users} SET playerid = ?, linkts = NOW() WHERE chanceuserid = ?`, [row.playerid, user.chanceuserid],
      );
      await this.dropPendingLinks(tx, user.chanceuserid);
      user.playerid = row.playerid;
      return true;
    });
    if (!linked) throw new BadRequestException(BAD_CODE);
    return { user: await this.profile(user) };
  }

  /** Délie le compte Campok. */
  // ─── Campok VIP vendu ici (vip-web.service.ts) ─────────────────────────────────────────────────

  async vipCheckout(session: string | undefined, plan: VipPlan) {
    const { user } = await this.fromSession(session);
    return this.vipWeb.checkout(user, plan);
  }

  async vipCancel(session: string | undefined) {
    const { user } = await this.fromSession(session);
    await this.vipWeb.cancel(user.playerid == null ? null : Number(user.playerid));
    return { user: await this.profile(user) };
  }

  // ─── Offre Analyse vendue ici (analyse-web.service.ts) ─────────────────────────────────────────

  async analyseCheckout(session: string | undefined, plan: AnalysePlan) {
    const { user } = await this.fromSession(session);
    return this.analyseWeb.checkout(user, plan);
  }

  async analyseCancel(session: string | undefined) {
    const { user } = await this.fromSession(session);
    await this.analyseWeb.cancel(Number(user.chanceuserid));
    return { user: await this.profile(user) };
  }

  async unlinkCampok(session: string | undefined) {
    const { user } = await this.fromSession(session);
    await this.dataSource.query(
      `UPDATE ${this.users} SET playerid = NULL, linkts = NULL WHERE chanceuserid = ?`, [user.chanceuserid],
    );
    user.playerid = null;
    return { user: await this.profile(user) };
  }

  /**
   * Mains Campok du joueur relié (offre 2), une ligne JSON par main (campok-hands.ts : ordre des coups refait, cartes
   * adverses seulement montrées, joueurs nommés par leur playerid). Après `after` (tablehandid), dans l'ordre ; sans
   * `after`, les plus récentes. `next` : curseur à renvoyer (dernière main lue, même refusée), `more` : il en reste.
   */
  async campokHands(session: string | undefined, dto: { after?: number; limit?: number }) {
    const { user } = await this.fromSession(session);
    if (user.playerid == null) throw new BadRequestException('Relie d’abord ton compte Campok.');
    const pid = Number(user.playerid), after = dto.after ?? null;
    const limit = Math.min(Math.max(Math.trunc(dto.limit ?? CAMPOK_HANDS_MAX), 1), CAMPOK_HANDS_MAX);
    const { rows, seats, actions, cards } = await this.campokRows(pid, after, limit);
    if (!rows.length) return { hands: [], next: after, more: false, skipped: 0 };
    const hands: { id: string; raw: string }[] = [], bad: string[] = [];
    for (const r of rows) {
      const k = Number(r.id);
      let raw: string | null = null, why = 'erreur';
      try { raw = campokHand(pid, r, seats.get(k) || [], actions.get(k) || [], cards.get(k) || [], w => (why = w)); } catch { raw = null; }
      if (raw) hands.push({ id: String(k), raw }); else bad.push(`${k} (${why})`);
    }
    if (bad.length) this.logger.warn(`Mains Campok : ${bad.length} main(s) sur ${rows.length} non relues (joueur ${pid}) : ${bad.slice(0, 10).join(', ')}`);
    return { hands, next: Number(rows[rows.length - 1].id), more: after != null && rows.length === limit, skipped: bad.length };
  }

  /**
   * Mains d'un joueur et leurs lignes (sièges, actions, cartes), rangées par tablehandid croissant : après `after`, sinon
   * les `limit` plus récentes. Aussi pour le script de vérification (campok-check.ts).
   */
  async campokRows(pid: number, after: number | null, limit: number) {
    const rows = await this.dataSource.query<HandRow[]>(
      `SELECT th.tablehandid AS id, th.startts AS ts, gt.label AS label, gt.tabletype AS tt, gt.tournamentid AS tid,
              gta.maxplayers AS maxp
       FROM gametableplayer gtp
       JOIN handplayer hp ON hp.gametableplayerid = gtp.gametableplayerid
       JOIN tablehand th ON th.tablehandid = hp.tablehandid
       JOIN gametable gt ON gt.gametableid = th.gametableid
       LEFT JOIN gametablearchetype gta ON gta.gametablearchetypeid = gt.gametablearchetypeid
       WHERE gtp.playerid = ? AND th.endts > 0 ${after != null ? 'AND th.tablehandid > ?' : ''}
       ORDER BY th.tablehandid ${after != null ? 'ASC' : 'DESC'} LIMIT ${Math.trunc(limit)}`,
      after != null ? [pid, after] : [pid],
    );
    rows.sort((a, b) => Number(a.id) - Number(b.id));
    const seats = new Map<number, SeatRow[]>(), actions = new Map<number, ActionRow[]>(), cards = new Map<number, CardRow[]>();
    if (!rows.length) return { rows, seats, actions, cards };
    const ids = rows.map(r => Number(r.id));
    const [S, A, C] = await Promise.all([
      this.dataSource.query<SeatRow[]>(
        `SELECT hp.tablehandid AS hand, hp.gametableplayerid AS gtp, gtp.playerid AS pid, gtp.seatno AS seat,
                hp.initstack AS init, hp.rake AS rake
         FROM handplayer hp JOIN gametableplayer gtp ON gtp.gametableplayerid = hp.gametableplayerid
         WHERE hp.tablehandid IN (?)`, [ids]),
      this.dataSource.query<ActionRow[]>(
        `SELECT tablehandid AS hand, gameactionid AS id, gametableplayerid AS gtp, type, betround AS round, amount
         FROM gameaction WHERE tablehandid IN (?)`, [ids]),
      this.dataSource.query<(CardRow & { hand: number })[]>(
        `SELECT a.tablehandid AS hand, c.gameactionid AS action, c.num, c.color, c.value
         FROM gameactioncard c JOIN gameaction a ON a.gameactionid = c.gameactionid
         WHERE a.tablehandid IN (?) AND a.type IN (8, 9, 10, 11)`, [ids]),
    ]);
    const add = <T>(m: Map<number, T[]>, k: number, x: T) => { const v = m.get(k); if (v) v.push(x); else m.set(k, [x]); };
    for (const x of S) add(seats, Number(x.hand), x);
    for (const x of A) add(actions, Number(x.hand), x);
    for (const x of C) add(cards, Number(x.hand), x);
    return { rows, seats, actions, cards };
  }


  /** « Se déconnecter partout » : toutes les sessions de ce compte deviennent invalides. */
  async logoutAll(session: string | undefined) {
    const { user } = await this.fromSession(session);
    await this.dataSource.query(
      `UPDATE ${this.users} SET sessionversion = sessionversion + 1 WHERE chanceuserid = ?`, [user.chanceuserid],
    );
    return { ok: true };
  }

  /** Suppression en deux temps : lien de confirmation envoyé à l'adresse du compte. */
  async requestDelete(session: string | undefined, ip: string) {
    const { user } = await this.fromSession(session);
    if (!(await this.underEmailLimit(user.email))) return SENT;
    const token = randomBytes(32).toString('base64url');
    await this.dataSource.query(
      `INSERT INTO ${this.logins} (email, purpose, tokenhash, ip, expirests)
       VALUES (?, 'delete', ?, ?, NOW() + INTERVAL ${LINK_TTL_MINUTES} MINUTE)`,
      [user.email, this.hmac(`t:${token}`), String(ip ?? '').slice(0, 45)],
    );
    await this.send(user.email, deleteMail(`${this.publicUrl}/compte/suppression?t=${token}`));
    return SENT;
  }

  /**
   * Confirme la suppression : compte, demandes en cours et contact Mailjet effacés. Renvoie l'id du
   * compte pour que le serveur du Chance-o-mètre efface aussi ses propres données (mains, bilans).
   */
  async confirmDelete(dto: { token: string }) {
    this.check();
    const email = await this.dataSource.transaction(async (tx) => {
      const [row] = await tx.query<{ email: string }[]>(
        `SELECT email FROM ${this.logins}
         WHERE tokenhash = ? AND purpose = 'delete' AND usedts IS NULL AND expirests > NOW() FOR UPDATE`,
        [this.hmac(`t:${dto.token}`)],
      );
      return row?.email ?? null;
    });
    if (!email) throw new BadRequestException(BAD_LINK);
    const id = await this.erase(email);
    if (id == null) throw new BadRequestException(BAD_LINK);
    return { deleted: true, id };
  }

  // ─── Backoffice ───────────────────────────────────────────────────────────────────────────────

  async stats() {
    const [totals] = await this.dataSource.query<Record<string, string | number>[]>(
      `SELECT COUNT(*) AS users, COALESCE(SUM(newsletter = 1), 0) AS newsletter,
              COALESCE(SUM(playerid IS NOT NULL), 0) AS campok,
              COALESCE(SUM(lastlogints > NOW() - INTERVAL 30 DAY), 0) AS active30
       FROM ${this.users}`,
    );
    const days = await this.dataSource.query<{ day: string; n: string | number }[]>(
      `SELECT DATE_FORMAT(creationts, '%Y-%m-%d') AS day, COUNT(*) AS n FROM ${this.users}
       WHERE creationts > NOW() - INTERVAL 30 DAY GROUP BY day ORDER BY day`,
    );
    // Demandes de création jamais confirmées (7 derniers jours) : adresses fausses, e-mails en spam.
    const [pending] = await this.dataSource.query<{ n: string | number }[]>(
      `SELECT COUNT(DISTINCT email) AS n FROM ${this.logins}
       WHERE purpose = 'signup' AND usedts IS NULL AND creationts > NOW() - INTERVAL 7 DAY
         AND email NOT IN (SELECT email FROM ${this.users})`,
    );
    return {
      users: Number(totals.users), newsletter: Number(totals.newsletter), campok: Number(totals.campok),
      active30: Number(totals.active30), unconfirmed7: Number(pending.n),
      signups: days.map((d) => ({ day: d.day, count: Number(d.n) })),
    };
  }

  /**
   * Liste des comptes du backoffice, filtres cumulables : `search` (e-mail), `state` (état du compte : campok = relié,
   * nocampok, vip, analyse = offre en cours, newsletter), `campok` (pseudo Campok du compte relié), `site` + `pseudo`
   * (pseudo d'une salle ANJ, cherché dans le registre « un pseudo, un compte » du service public : seule l'empreinte y
   * est gardée, le pseudo n'est jamais stocké). `pseudoResult` : found, unknown (jamais envoyé), blocked (compte supprimé)
   * ou unavailable (service public injoignable).
   */
  async list(search: string, page: number, pageSize: number,
    f: { state?: string; campok?: string; site?: string; pseudo?: string } = {}) {
    const size = Math.min(Math.max(pageSize || 50, 1), 200);
    const offset = Math.max(page || 0, 0) * size;
    const esc = (v: string) => `%${v.trim().toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    const where: string[] = ['u.email LIKE ?'];
    const args: unknown[] = [esc(String(search ?? ''))];
    const none = (pseudoResult: string | null = null) => ({ items: [], total: 0, pseudoResult });
    if (f.state === 'campok') where.push('u.playerid IS NOT NULL');
    else if (f.state === 'nocampok') where.push('u.playerid IS NULL');
    else if (f.state === 'vip') where.push('p.accounttype = 1 AND p.endvipts > NOW()');
    else if (f.state === 'newsletter') where.push('u.newsletter = 1');
    else if (f.state === 'analyse') {
      const ids = await this.analyseWeb.activeIds();
      if (!ids.length) return none();
      where.push(`u.chanceuserid IN (${ids.map(() => '?').join(', ')})`); args.push(...ids);
    }
    if (f.campok?.trim()) { where.push('LOWER(pi.screenname) LIKE ?'); args.push(esc(f.campok)); }
    let pseudoResult: string | null = null;
    if (f.site && f.pseudo?.trim()) {
      const owner = await this.siteOwner(f.site, f.pseudo.trim());
      if (owner === 'unavailable') return none('unavailable');
      if (owner == null) return none('unknown');
      if (owner.blocked) return none('blocked');
      pseudoResult = 'found';
      where.push('u.chanceuserid = ?'); args.push(owner.uid);
    }
    const from = `FROM ${this.users} u
       LEFT JOIN playerinfos pi ON pi.playerid = u.playerid
       LEFT JOIN player p ON p.playerid = u.playerid
       WHERE ${where.join(' AND ')}`;
    // Compte Campok relié : pseudo et VIP en ce moment (même règle que vipWeb.status) ; offre Analyse en cours.
    const items = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT u.chanceuserid AS id, u.email, u.newsletter, u.playerid AS playerId, u.creationts AS creationTs,
              u.lastlogints AS lastLoginTs, u.linkts AS linkTs, pi.screenname AS screenName,
              (p.accounttype = 1 AND p.endvipts > NOW()) AS vip, p.endvipts AS vipUntil
       ${from} ORDER BY u.chanceuserid DESC LIMIT ${size} OFFSET ${offset}`,
      args,
    );
    const ana = await this.analyseWeb.untilOf(items.map((i) => Number(i.id)));
    const [total] = await this.dataSource.query<{ n: string | number }[]>(`SELECT COUNT(*) AS n ${from}`, args);
    return {
      items: items.map((i) => {
        const vip = Number(i.vip) === 1;
        return { ...i, newsletter: !!i.newsletter, vip, vipUntil: vip && i.vipUntil ? new Date(i.vipUntil as string).toISOString() : null,
          analyseUntil: ana.get(Number(i.id)) ?? null };
      }),
      total: Number(total.n),
      pseudoResult,
    };
  }

  /** Compte rattaché au pseudo d'une salle, lu dans le registre du service public (GET /interne/joueur). */
  private async siteOwner(site: string, pseudo: string): Promise<{ uid: number; blocked: boolean } | null | 'unavailable'> {
    if (this.partnerKey.length < SECRET_MIN) return 'unavailable';
    try {
      const q = new URLSearchParams({ site, pseudo });
      const res = await fetch(`${this.publicUrl}/interne/joueur?${q}`, {
        headers: { Authorization: `Bearer ${this.partnerKey}` }, redirect: 'error', signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
      });
      if (!res.ok) { this.logger.warn(`Service public : GET /interne/joueur → ${res.status}`); return 'unavailable'; }
      const o = ((await res.json()) as { owner?: { uid?: unknown; blocked?: unknown } | null }).owner;
      return o && Number.isSafeInteger(o.uid) ? { uid: Number(o.uid), blocked: o.blocked === true } : null;
    } catch (e) {
      this.logger.warn(`Service public injoignable (${(e as Error).message})`);
      return 'unavailable';
    }
  }

  /**
   * Fiche d'un compte : compte, offres en cours, achats et abonnements (offre Analyse du compte ; Campok VIP et achats
   * dans l'app du joueur relié), et ce que garde le service public (bilan de chance, mains du module d'analyse, profil
   * de jeu), lu sur sa route interne avec la clé partagée. Service public injoignable : `site` = null et `siteError`.
   */
  async adminDetail(id: number, room: string | null = null) {
    const [u] = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT u.chanceuserid AS id, u.email, u.newsletter, u.newsletterts AS newsletterTs, u.adult, u.playerid AS playerId,
              u.creationts AS creationTs, u.lastlogints AS lastLoginTs, u.linkts AS linkTs, pi.screenname AS screenName
       FROM ${this.users} u LEFT JOIN playerinfos pi ON pi.playerid = u.playerid WHERE u.chanceuserid = ?`, [id],
    );
    if (!u) throw new NotFoundException(`Compte ${id} introuvable`);
    const pid = u.playerId == null ? null : Number(u.playerId);
    const [vip, analyse, ana, vp, site] = await Promise.all([
      pid == null ? { vip: false, vipUntil: null, vipSub: null } : this.vipWeb.status(pid),
      this.analyseWeb.status(id),
      this.analyseWeb.adminPurchases(id),
      pid == null ? { payments: [], subs: [] } : this.vipWeb.adminPurchases(pid),
      this.siteDetail(id, room),
    ]);
    const byTs = (a: { ts: string | null }, b: { ts: string | null }) => (b.ts ?? '').localeCompare(a.ts ?? '');
    return {
      user: { ...u, newsletter: !!u.newsletter, adult: !!u.adult },
      vip, analyse,
      purchases: [...ana.payments, ...vp.payments].sort(byTs),
      subscriptions: [...ana.subs, ...vp.subs],
      ...site,
    };
  }

  /** Données du compte gardées par le service public (GET /interne/compte/:id, clé CHANCE_PARTNER_KEY). */
  private async siteDetail(id: number, room: string | null): Promise<{ site: Record<string, unknown> | null; siteError: string | null }> {
    if (this.partnerKey.length < SECRET_MIN) return { site: null, siteError: 'CHANCE_PARTNER_KEY absente : données du service public indisponibles.' };
    try {
      const q = room ? `?${new URLSearchParams({ site: room })}` : '';
      const res = await fetch(`${this.publicUrl}/interne/compte/${id}${q}`, {
        headers: { Authorization: `Bearer ${this.partnerKey}` }, redirect: 'error', signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Service public : GET /interne/compte/${id} → ${res.status}`);
        return { site: null, siteError: `Service public : erreur ${res.status}${res.status === 404 ? ' (pas encore mis à jour ?)' : ''}.` };
      }
      return { site: await res.json() as Record<string, unknown>, siteError: null };
    } catch (e) {
      this.logger.warn(`Service public injoignable (${(e as Error).message})`);
      return { site: null, siteError: 'Service public injoignable.' };
    }
  }

  /** Suppression demandée au support (droit à l'effacement). */
  async adminDelete(id: number, pseudos: 'bloquer' | 'liberer' = 'bloquer') {
    const [row] = await this.dataSource.query<{ email: string }[]>(
      `SELECT email FROM ${this.users} WHERE chanceuserid = ?`, [id],
    );
    if (!row) throw new NotFoundException(`Compte ${id} introuvable`);
    // Données du service public d'abord (bilan, mains, pseudos bloqués ou libérés) : s'il ne répond pas, le compte reste,
    // sinon ses données y resteraient sans compte et ses pseudos rattachés à un compte disparu.
    const site = await this.sitePost(`/interne/compte/${id}/supprimer`, { pseudos });
    if (await this.erase(row.email) == null) throw new NotFoundException(`Compte ${id} introuvable`);
    return { deleted: true, id, site };
  }

  /** Backoffice : libère le pseudo d'une salle (bloqué ou rattaché à un compte) dans le registre du service public. */
  async adminReleasePseudo(site: string, pseudo: string) {
    if (!['Winamax', 'PokerStars', 'Betclic', 'PMU'].includes(site) || !pseudo?.trim() || pseudo.length > 64)
      throw new BadRequestException('Salle ou pseudo invalide.');
    return this.sitePost('/interne/joueur/liberer', { site, pseudo: pseudo.trim() });
  }

  /** Backoffice : libère tous les pseudos des salles rattachés à un compte. */
  async adminReleasePseudos(id: number) {
    return this.sitePost(`/interne/compte/${id}/liberer-pseudos`, {});
  }

  /** Appel d'une route interne du service public (clé CHANCE_PARTNER_KEY) ; injoignable ou erreur : 503. */
  private async sitePost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.partnerKey.length < SECRET_MIN) throw new ServiceUnavailableException('CHANCE_PARTNER_KEY absente : service public injoignable.');
    let res: Response;
    try {
      res = await fetch(`${this.publicUrl}${path}`, {
        method: 'POST', body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${this.partnerKey}`, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      this.logger.warn(`Service public injoignable (${(e as Error).message})`);
      throw new ServiceUnavailableException('Service public injoignable : rien n’a été fait.');
    }
    if (!res.ok) {
      this.logger.warn(`Service public : POST ${path} → ${res.status}`);
      throw new ServiceUnavailableException(`Service public : erreur ${res.status}${res.status === 404 ? ' (pas encore mis à jour ?)' : ''} : rien n’a été fait.`);
    }
    return await res.json() as Record<string, unknown>;
  }

  // ─── Interne ──────────────────────────────────────────────────────────────────────────────────

  private check() {
    if (!this.ready) throw new ServiceUnavailableException('Comptes indisponibles pour le moment.');
  }

  private hmac(v: string): string {
    return createHmac('sha256', this.tokenSecret).update(v).digest('hex');
  }

  private same(a: string | undefined, b: string): boolean {
    return !!a && a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  }

  private async userByEmail(tx: EntityManager, email: string): Promise<UserRow | undefined> {
    const [u] = await tx.query<UserRow[]>(
      `SELECT chanceuserid, email, newsletter, playerid, sessionversion, creationts
       FROM ${this.users} WHERE email = ? FOR UPDATE`,
      [email],
    );
    return u;
  }

  private async profile(u: UserRow): Promise<ChanceProfile> {
    let campokName: string | null = null;
    let st: { vip: boolean; vipUntil: string | null; vipSub: 'active' | 'canceled' | null } = { vip: false, vipUntil: null, vipSub: null };
    if (u.playerid != null) {
      const [p] = await this.dataSource.query<{ screenname: string | null }[]>(
        'SELECT screenname FROM playerinfos WHERE playerid = ?', [u.playerid],
      );
      campokName = p?.screenname ?? null;
      st = await this.vipWeb.status(Number(u.playerid));
    }
    const an = await this.analyseWeb.status(Number(u.chanceuserid));
    return {
      id: u.chanceuserid, email: u.email, creationTs: u.creationts,
      newsletter: !!u.newsletter, campok: u.playerid != null, campokName, ...st, vipShop: this.vipWeb.enabled,
      ...an, analyseShop: await this.analyseWeb.enabled(),
    };
  }

  /** Joueur Campok de ce pseudo (casse exacte d'abord, sinon selon la collation de la base). */
  private async playerByPseudo(pseudo: string): Promise<{ playerid: number } | null> {
    const rows = await this.dataSource.query<{ playerid: number; screenname: string }[]>(
      'SELECT playerid, screenname FROM playerinfos WHERE screenname = ? LIMIT 5', [pseudo],
    );
    const p = rows.find((r) => r.screenname === pseudo) ?? (rows.length === 1 ? rows[0] : undefined);
    return p ? { playerid: Number(p.playerid) } : null;
  }

  private async countLinks(where: string, args: unknown[]): Promise<number> {
    const [r] = await this.dataSource.query<{ n: string | number }[]>(
      `SELECT COUNT(*) AS n FROM ${this.links} WHERE ${where} AND creationts > NOW() - INTERVAL 1 HOUR`, args,
    );
    return Number(r.n);
  }

  /** Table des codes de liaison présente (sql/003 passé) ? MySQL : une erreur n'annule pas la transaction. */
  private async hasLinkTable(tx: EntityManager): Promise<boolean> {
    try {
      await tx.query(`SELECT 1 FROM ${this.links} LIMIT 0`);
      return true;
    } catch {
      return false;
    }
  }

  /** Demandes de code encore en attente de ce compte : annulées, et leurs notifications consommées. */
  private async dropPendingLinks(tx: EntityManager, chanceuserid: number) {
    await tx.query(
      `UPDATE notification n JOIN ${this.links} l ON l.notificationid = n.notificationid
       SET n.isconsumed = 1 WHERE l.chanceuserid = ? AND l.usedts IS NULL`,
      [chanceuserid],
    );
    await tx.query(
      `UPDATE ${this.links} SET usedts = NOW(), code = NULL WHERE chanceuserid = ? AND usedts IS NULL`, [chanceuserid],
    );
  }

  /** Push en plus de la notification interne, seulement si le téléphone l'affichera (jeton et autorisation). */
  private async pushLinkCode(playerId: number, code: string) {
    // Journaux sans le code : seulement le joueur et ce qui s'est passé.
    if (!this.fcm.enabled) return this.logger.log(`Push code Chance-o-mètre joueur ${playerId} : push désactivée (FIREBASE_SERVICE_ACCOUNT)`);
    const [p] = await this.dataSource.query<{ tokenfb: string | null; notifosgranted: number | null }[]>(
      'SELECT tokenfb, notifosgranted FROM playerinfos WHERE playerid = ?', [playerId],
    ).catch(() => [] as { tokenfb: string | null; notifosgranted: number | null }[]);
    if (!p?.tokenfb || Number(p.notifosgranted) !== 1)
      return this.logger.log(`Push code Chance-o-mètre joueur ${playerId} : non envoyée (${!p?.tokenfb ? 'pas de tokenfb' : `notifosgranted = ${p.notifosgranted}`})`);
    const ok = await this.fcm.send(
      p.tokenfb, 'Code de liaison Chance-o-mètre',
      `Ton code : ${code} (valable ${LINK_CODE_MINUTES} minutes). Ne le donne à personne.`,
    );
    this.logger.log(`Push code Chance-o-mètre joueur ${playerId} : ${ok ? 'acceptée par Firebase' : 'échec (voir FcmService)'}`);
  }

  private sign(u: UserRow): Promise<string> {
    return this.jwt.signAsync(
      { sub: u.chanceuserid, v: u.sessionversion, purpose: SESSION_PURPOSE },
      { secret: this.sessionSecret, expiresIn: `${SESSION_DAYS}d` },
    );
  }

  private async fromSession(token: string | undefined): Promise<{ user: UserRow; iat: number }> {
    this.check();
    if (!token) throw new UnauthorizedException(BAD_SESSION);
    let p: { sub: number; v: number; purpose: string; iat: number };
    try {
      p = await this.jwt.verifyAsync(token, { secret: this.sessionSecret });
    } catch {
      throw new UnauthorizedException(BAD_SESSION);
    }
    if (p.purpose !== SESSION_PURPOSE) throw new UnauthorizedException(BAD_SESSION);
    const [user] = await this.dataSource.query<UserRow[]>(
      `SELECT chanceuserid, email, newsletter, playerid, sessionversion, creationts
       FROM ${this.users} WHERE chanceuserid = ?`,
      [p.sub],
    );
    // Compte supprimé ou « Se déconnecter partout » : la session ne vaut plus rien.
    if (!user || Number(user.sessionversion) !== Number(p.v)) throw new UnauthorizedException(BAD_SESSION);
    return { user, iat: p.iat };
  }

  /**
   * Efface le compte et toutes les demandes de cette adresse ; null si aucun compte. Avant : abonnement de l'offre
   * Analyse arrêté chez Stripe (échec : 503, rien n'est effacé, la suppression se refait).
   */
  private async erase(email: string): Promise<number | null> {
    const [pre] = await this.dataSource.query<{ id: number }[]>(`SELECT chanceuserid AS id FROM ${this.users} WHERE email = ?`, [email]);
    if (pre) await this.analyseWeb.forget(Number(pre.id));
    const id = await this.dataSource.transaction(async (tx) => {
      const user = await this.userByEmail(tx, email);
      if (!user) return null;
      if (await this.hasLinkTable(tx)) {
        await this.dropPendingLinks(tx, user.chanceuserid);
        await tx.query(`DELETE FROM ${this.links} WHERE chanceuserid = ?`, [user.chanceuserid]);
      }
      await tx.query(`DELETE FROM ${this.users} WHERE chanceuserid = ?`, [user.chanceuserid]);
      await tx.query(`DELETE FROM ${this.logins} WHERE email = ?`, [email]);
      return user.chanceuserid;
    });
    if (id != null) await this.mailjet.forget(email);
    return id;
  }

  private async limitIp(ip: string) {
    if (!ip) return;
    const [r] = await this.dataSource.query<{ n: string | number }[]>(
      `SELECT COUNT(*) AS n FROM ${this.logins} WHERE ip = ? AND creationts > NOW() - INTERVAL 1 HOUR`, [ip],
    );
    if (Number(r.n) >= PER_IP_HOUR) {
      throw new HttpException('Trop de demandes depuis cette adresse : réessaie plus tard.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async underEmailLimit(email: string): Promise<boolean> {
    const [r] = await this.dataSource.query<{ n: string | number }[]>(
      `SELECT COUNT(*) AS n FROM ${this.logins} WHERE email = ? AND creationts > NOW() - INTERVAL 1 HOUR`, [email],
    );
    if (Number(r.n) < PER_EMAIL_HOUR) return true;
    this.logger.warn(`Limite d'e-mails atteinte pour ${email} : demande ignorée`);
    return false;
  }

  /**
   * Demandes de plus de 7 jours : inutiles (liens expirés, limites horaires passées). Codes de liaison
   * expirés : effacés, et leurs notifications consommées (elles disparaissent de l'app).
   */
  private async purge() {
    await this.dataSource.query(`DELETE FROM ${this.logins} WHERE creationts < NOW() - INTERVAL 7 DAY`);
    try {
      await this.dataSource.query(
        `UPDATE notification n JOIN ${this.links} l ON l.notificationid = n.notificationid
         SET n.isconsumed = 1, l.code = NULL, l.usedts = NOW()
         WHERE l.usedts IS NULL AND l.expirests <= NOW()`,
      );
      await this.dataSource.query(`DELETE FROM ${this.links} WHERE creationts < NOW() - INTERVAL 7 DAY`);
    } catch (e) {
      // Table chancelink absente (sql/003 pas encore passé) : la connexion par e-mail doit continuer à marcher.
      this.logger.error(`Purge des codes de liaison impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async send(to: string, m: ChanceMail) {
    if (!(await this.mail.send(to, m.subject, m.text, undefined, this.mailFrom))) {
      this.logger.error(`E-mail « ${m.subject} » non envoyé à ${to}`);
    }
  }
}
