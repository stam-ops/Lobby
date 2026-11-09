import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Liste de nouvelles du Chance-o-mètre, chez Mailjet (API Contacts). Les e-mails de connexion, eux,
 * partent par MailService (relais SMTP de Mailjet : SMTP_HOST=in-v3.mailjet.com, clés API en
 * SMTP_USER / SMTP_PASSWORD).
 *
 * Une adresse n'entre dans la liste QUE si la case « nouvelles » est cochée ; elle en sort quand la
 * case est décochée, et le contact est effacé de Mailjet quand le compte est supprimé. La
 * désinscription par le lien de chaque envoi est gérée par Mailjet lui-même.
 *
 * Sans MAILJET_API_KEY / MAILJET_API_SECRET / MAILJET_LIST_ID : mode JOURNAL (rien n'est envoyé),
 * comme MailService sans SMTP. Une erreur de Mailjet n'est jamais remontée à l'appelant : la création
 * ou la suppression d'un compte ne doit pas échouer à cause de lui (elle est journalisée).
 */
@Injectable()
export class MailjetService {
  private readonly logger = new Logger(MailjetService.name);
  private readonly auth: string | null;
  private readonly listId: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('MAILJET_API_KEY');
    const secret = config.get<string>('MAILJET_API_SECRET');
    this.listId = config.get<string>('MAILJET_LIST_ID', '');
    this.auth = key && secret && /^\d+$/.test(this.listId)
      ? 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
      : null;
    if (!this.auth) this.logger.warn('Mailjet non configuré — la liste de nouvelles ne sera pas tenue (journal seulement).');
  }

  /** Ajoute à la liste. `addnoforce` : ne réinscrit pas quelqu'un qui s'est désinscrit chez Mailjet. */
  subscribe(email: string): Promise<boolean> {
    return this.manage(email, 'addnoforce');
  }

  /** Retire de la liste (case décochée). */
  unsubscribe(email: string): Promise<boolean> {
    return this.manage(email, 'unsub');
  }

  /** Compte supprimé : contact effacé de Mailjet (droit à l'effacement), pas seulement retiré de la liste. */
  async forget(email: string): Promise<boolean> {
    if (!this.auth) return this.log('effacement', email);
    try {
      const res = await this.call('GET', `/v3/REST/contact/${encodeURIComponent(email)}`);
      if (res.status === 404) return true; // jamais inscrit
      const id = ((await res.json()) as { Data?: { ID?: number }[] }).Data?.[0]?.ID;
      if (!id) return true;
      const del = await this.call('DELETE', `/v4/contacts/${id}`);
      if (!del.ok) throw new Error(`HTTP ${del.status}`);
      return true;
    } catch (e) {
      this.logger.error(`Mailjet : effacement de ${email} impossible : ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private async manage(email: string, action: 'addnoforce' | 'unsub'): Promise<boolean> {
    if (!this.auth) return this.log(action, email);
    try {
      const res = await this.call('POST', `/v3/REST/contactslist/${this.listId}/managecontact`, { Email: email, Action: action });
      // 404 : liste MAILJET_LIST_ID introuvable pour ces clés (mauvais ID, ou liste d'un autre compte / sous-compte).
      if (!res.ok) throw new Error(`HTTP ${res.status} (liste ${this.listId}) : ${(await res.text().catch(() => '')).slice(0, 300)}`);
      return true;
    } catch (e) {
      this.logger.error(`Mailjet : ${action} de ${email} impossible : ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private call(method: string, path: string, body?: unknown) {
    return fetch(`https://api.mailjet.com${path}`, {
      method,
      headers: { Authorization: this.auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      // Un prestataire lent ne doit pas bloquer la requête du visiteur.
      signal: AbortSignal.timeout(5000),
    });
  }

  private log(action: string, email: string): boolean {
    this.logger.log(`[MAILJET NON CONFIGURÉ] ${action} : ${email}`);
    return true;
  }
}
