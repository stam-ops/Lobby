import {
  BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
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
import { CHANCE_LINK_NOTIF_TYPE, chanceTable } from './chance-db';
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
  private readonly ready: boolean;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly mailjet: MailjetService,
    private readonly captcha: CaptchaService,
    private readonly fcm: FcmService,
    config: ConfigService,
  ) {
    this.users = chanceTable(config, 'chanceuser');
    this.logins = chanceTable(config, 'chancelogin');
    this.links = chanceTable(config, 'chancelink');
    this.tokenSecret = config.get<string>('CHANCE_TOKEN_SECRET', '');
    this.sessionSecret = config.get<string>('CHANCE_SESSION_SECRET', '');
    this.publicUrl = config.get<string>('CHANCE_PUBLIC_URL', 'http://localhost:5174').replace(/\/+$/, '');
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
    if (!(await this.underEmailLimit(email))) return SENT;

    const [user] = await this.dataSource.query<{ id: number }[]>(
      `SELECT chanceuserid AS id FROM ${this.users} WHERE email = ?`, [email],
    );
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
  async unlinkCampok(session: string | undefined) {
    const { user } = await this.fromSession(session);
    await this.dataSource.query(
      `UPDATE ${this.users} SET playerid = NULL, linkts = NULL WHERE chanceuserid = ?`, [user.chanceuserid],
    );
    user.playerid = null;
    return { user: await this.profile(user) };
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

  async list(search: string, page: number, pageSize: number) {
    const size = Math.min(Math.max(pageSize || 50, 1), 200);
    const offset = Math.max(page || 0, 0) * size;
    const like = `%${String(search ?? '').trim().toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    const items = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT chanceuserid AS id, email, newsletter, playerid AS playerId, creationts AS creationTs,
              lastlogints AS lastLoginTs
       FROM ${this.users} WHERE email LIKE ? ORDER BY chanceuserid DESC LIMIT ${size} OFFSET ${offset}`,
      [like],
    );
    const [total] = await this.dataSource.query<{ n: string | number }[]>(
      `SELECT COUNT(*) AS n FROM ${this.users} WHERE email LIKE ?`, [like],
    );
    return {
      items: items.map((i) => ({ ...i, newsletter: !!i.newsletter })),
      total: Number(total.n),
    };
  }

  /** Suppression demandée au support (droit à l'effacement). */
  async adminDelete(id: number) {
    const [row] = await this.dataSource.query<{ email: string }[]>(
      `SELECT email FROM ${this.users} WHERE chanceuserid = ?`, [id],
    );
    if (!row || (await this.erase(row.email)) == null) throw new NotFoundException(`Compte ${id} introuvable`);
    return { deleted: true, id };
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
    if (u.playerid != null) {
      const [p] = await this.dataSource.query<{ screenname: string }[]>(
        'SELECT screenname FROM playerinfos WHERE playerid = ?', [u.playerid],
      );
      campokName = p?.screenname ?? null;
    }
    return {
      id: u.chanceuserid, email: u.email, creationTs: u.creationts,
      newsletter: !!u.newsletter, campok: u.playerid != null, campokName,
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

  /** Efface le compte et toutes les demandes de cette adresse ; null si aucun compte. */
  private async erase(email: string): Promise<number | null> {
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
    if (!(await this.mail.send(to, m.subject, m.text))) {
      this.logger.error(`E-mail « ${m.subject} » non envoyé à ${to}`);
    }
  }
}
