import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { MailService } from './mail.service';

/** Revendication d'usage : empêche un jeton de vérification de servir de jeton d'auth. */
const TOKEN_PURPOSE = 'organizer-email-verify';
const TOKEN_TTL = '48h';

interface VerifyPayload { sub: number; purpose: string }

/**
 * Inscription publique d'un organisateur de tournois, puis vérification de son adresse.
 *
 * Deux portes, volontairement distinctes :
 *  1. vérification d'e-mail (lien signé) — prouve que l'adresse appartient au demandeur ;
 *  2. validation admin — juge la légitimité du dossier.
 *
 * ⚠️ Le verrou d'accès effectif n'est NI l'une NI l'autre de ces colonnes, mais
 * `AdminAuthService.login`, qui refuse d'émettre un JWT quand `backofficeuser.active = 0`.
 * Un compte inscrit mais non validé ne peut donc atteindre aucune route, quel que soit son rôle.
 * Les colonnes ci-dessous pilotent la file de validation, pas la sécurité.
 */
@Injectable()
export class OrganizerSignupService {
  private readonly logger = new Logger(OrganizerSignupService.name);
  private readonly tokenSecret: string;
  private readonly publicUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    // Secret DISTINCT de JWT_SECRET : même avec la revendication `purpose`, réutiliser le secret
    // d'authentification ferait qu'un jeton de vérification serait accepté par
    // AdminAuthService.verifyToken. On veut que la signature elle-même ne corresponde pas.
    const secret = config.get<string>('EMAIL_TOKEN_SECRET');
    if (!secret) {
      this.logger.warn(
        'EMAIL_TOKEN_SECRET absent — repli sur JWT_SECRET + suffixe. À définir en production.',
      );
    }
    this.tokenSecret = secret ?? `${config.get<string>('JWT_SECRET', 'dev')}::email-verify`;
    this.publicUrl = config.get<string>('BACKOFFICE_URL', 'http://localhost:5173');
  }

  /**
   * Crée un organisateur inactif + son compte backoffice inactif, puis envoie le lien.
   *
   * Retourne TOUJOURS le même message, que l'adresse soit déjà prise ou non : une réponse
   * différenciée permettrait d'énumérer les organisateurs inscrits.
   */
  async signup(
    organizationName: string, email: string, password: string, description = '',
  ): Promise<void> {
    const name = organizationName.trim();
    const mail = email.trim().toLowerCase();
    const desc = description.trim().slice(0, 2000);
    if (!name) throw new BadRequestException("Le nom de l'organisation est requis");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new BadRequestException('Adresse e-mail invalide');
    if (password.length < 10) {
      throw new BadRequestException('Le mot de passe doit faire au moins 10 caractères');
    }

    const existing = await this.dataSource.query<{ n: number }[]>(
      `SELECT (SELECT COUNT(*) FROM backofficeuser WHERE email = ?)
            + (SELECT COUNT(*) FROM organizer WHERE contactemail = ?) AS n`,
      [mail, mail],
    );
    if (Number(existing[0]?.n ?? 0) > 0) {
      // Silencieux : on n'indique pas que l'adresse est prise. Un organisateur légitime qui
      // s'inscrit deux fois utilisera le lien du premier envoi.
      this.logger.log(`Inscription ignorée, adresse déjà connue : ${mail}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Transaction : un compte sans organisateur rattaché, ou l'inverse, serait un état que la
    // file de validation ne saurait pas présenter.
    let organizerId: number;
    try {
      organizerId = await this.dataSource.transaction(async (tx) => {
        const res = await tx.query(
          'INSERT INTO organizer (name, description, contactemail, active) VALUES (?, ?, ?, 0)',
          [name.slice(0, 200), desc || null, mail.slice(0, 255)],
        );
        const id = Number(res?.insertId ?? 0);
        await tx.query(
          `INSERT INTO backofficeuser (email, password, role, organizerid, active)
           VALUES (?, ?, 'club', ?, 0)`,
          [mail.slice(0, 255), passwordHash, id],
        );
        return id;
      });
    } catch (e) {
      // Course entre le SELECT ci-dessus et l'INSERT : deux soumissions simultanées de la même
      // adresse passent toutes deux le contrôle, et c'est la contrainte d'unicité qui tranche.
      // On traite ce cas comme un doublon ordinaire — sinon le demandeur reçoit un 500 là où le
      // contrôle applicatif aurait répondu le message générique, ce qui trahirait au passage
      // l'existence de l'adresse.
      if ((e as { code?: string })?.code === 'ER_DUP_ENTRY') {
        this.logger.log(`Inscription concurrente ignorée, adresse déjà prise : ${mail}`);
        return;
      }
      throw e;
    }

    await this.sendVerificationLink(organizerId, name, mail);
  }

  /**
   * (Re)génère un lien de vérification et l'envoie. Réutilisé par la file de validation admin :
   * si l'envoi initial a échoué (clé expirée, domaine non vérifié…), le dossier resterait sinon
   * bloqué pour toujours, l'admin ne voyant que les adresses confirmées.
   *
   * Retourne false si l'envoi a échoué, pour que l'admin le sache immédiatement.
   */
  async sendVerificationLink(organizerId: number, name: string, email: string): Promise<boolean> {
    const token = await this.jwt.signAsync(
      { sub: organizerId, purpose: TOKEN_PURPOSE } satisfies VerifyPayload,
      { secret: this.tokenSecret, expiresIn: TOKEN_TTL },
    );
    const link = `${this.publicUrl}/organisateur/verification?token=${encodeURIComponent(token)}`;

    return this.mail.send(
      email,
      'Confirmez votre adresse — Campok',
      `Bonjour,\n\nVous avez demandé la création d'un espace organisateur pour « ${name} ».\n`
      + `Confirmez votre adresse en ouvrant ce lien (valable 48 h) :\n\n${link}\n\n`
      + `Votre demande sera ensuite examinée par notre équipe.\n`
      + `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n`,
    );
  }

  /** Valide le jeton et marque l'adresse comme vérifiée. Idempotent. */
  async verifyEmail(token: string): Promise<{ organizationName: string }> {
    let payload: VerifyPayload;
    try {
      payload = await this.jwt.verifyAsync<VerifyPayload>(token, { secret: this.tokenSecret });
    } catch {
      throw new BadRequestException('Lien invalide ou expiré. Merci de recommencer votre inscription.');
    }
    // Vérification explicite malgré le secret dédié : deux barrières valent mieux qu'une si la
    // configuration retombe un jour sur le secret partagé.
    if (payload.purpose !== TOKEN_PURPOSE) {
      throw new BadRequestException('Lien invalide.');
    }

    const rows = await this.dataSource.query<{ name: string }[]>(
      'SELECT name FROM organizer WHERE organizerid = ?',
      [payload.sub],
    );
    if (!rows.length) throw new BadRequestException('Lien invalide.');

    await this.dataSource.query(
      'UPDATE organizer SET emailverifiedts = NOW() WHERE organizerid = ? AND emailverifiedts IS NULL',
      [payload.sub],
    );
    return { organizationName: rows[0].name };
  }
}
