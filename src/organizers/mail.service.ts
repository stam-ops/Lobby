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
    this.transporter = createTransport({
      host,
      port,
      // 465 = TLS implicite ; 587 et 25 montent en TLS via STARTTLS.
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    this.logger.log(`SMTP configuré : ${host}:${port}`);
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
