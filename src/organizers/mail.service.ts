import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Envoi d'e-mails transactionnels du backoffice (vérification d'adresse des organisateurs).
 *
 * ⚠️ NE PAS confondre avec la file `emailtosent` du jeu : celle-ci porte
 * `FOREIGN KEY (playerid) REFERENCES player(playerid)` et ne peut donc pas servir à un
 * organisateur, qui n'est pas un joueur. Son consommateur n'est d'ailleurs pas dans ce dépôt.
 *
 * Transport SMTP générique plutôt qu'un SDK propriétaire : changer de prestataire ne demande que
 * de nouvelles variables d'environnement.
 *
 * Sans SMTP_HOST configuré, le service passe en mode JOURNAL : le message est écrit dans les logs
 * et l'envoi est considéré comme réussi. C'est volontaire — le développement et les tests ne
 * doivent pas exiger un serveur SMTP, et une inscription ne doit pas échouer à cause de lui.
 * Le lien de vérification étant loggué, le flux reste testable de bout en bout.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@campok.fr');

    if (!host) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST absent — les e-mails seront écrits dans les logs, pas envoyés.');
      return;
    }
    const port = Number(this.config.get('SMTP_PORT', 587));
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');

    // Mode TLS déduit du port, avec surcharge explicite possible.
    //
    // ⚠️ Piège : les ports à TLS IMPLICITE ne se limitent pas à 465. Les hébergeurs bloquant
    // fréquemment les ports SMTP sortants, les prestataires exposent des ports de repli — chez
    // Resend, 2465 double 465 (TLS implicite) et 2587 double 587 (STARTTLS). Ne tester que 465
    // faisait passer 2465 en clair : le serveur attendait une poignée de main TLS pendant que le
    // client attendait une bannière, d'où un « Greeting never received ».
    const IMPLICIT_TLS_PORTS = [465, 2465];
    const secureOverride = this.config.get<string>('SMTP_SECURE');
    const secure = secureOverride != null && secureOverride !== ''
      ? secureOverride === 'true'
      : IMPLICIT_TLS_PORTS.includes(port);

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      // Sans délai explicite, un port filtré laisse la requête pendante très longtemps et
      // l'inscription paraît figée côté navigateur.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    this.logger.log(`SMTP configuré : ${host}:${port} (TLS ${secure ? 'implicite' : 'STARTTLS'})`);
  }

  /** Retourne false si l'envoi a échoué — l'appelant décide si c'est bloquant. */
  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`[MAIL NON ENVOYÉ] à=${to} sujet="${subject}"\n${text}`);
      return true;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      return true;
    } catch (e) {
      // On ne relaie pas l'erreur du prestataire à l'appelant : elle finirait dans une réponse HTTP
      // publique et révélerait la configuration d'infrastructure.
      this.logger.error(`Échec d'envoi à ${to} : ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
