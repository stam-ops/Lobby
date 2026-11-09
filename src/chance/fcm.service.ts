import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { JWT } from 'google-auth-library';

/**
 * Push Firebase (FCM v1) depuis LobbyWS, comme NotificationSender.sendPush de FrontWebCampok : même compte
 * de service (service.json, chemin dans FIREBASE_SERVICE_ACCOUNT), même jeton du téléphone
 * (playerinfos.tokenfb). Simple alerte : la notification interne (table notification) reste la source,
 * car une push n'est pas affichée quand l'app est au premier plan, et souvent pas reçue.
 *
 * Sans FIREBASE_SERVICE_ACCOUNT, ou fichier illisible : push désactivée (journal seulement).
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly client: JWT | null = null;
  private readonly projectId: string = '';

  constructor(config: ConfigService) {
    const file = config.get<string>('FIREBASE_SERVICE_ACCOUNT', '');
    if (!file) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT absent : pas de push pour les codes du Chance-o-mètre.');
      return;
    }
    try {
      const sa = JSON.parse(readFileSync(file, 'utf8')) as { client_email: string; private_key: string; project_id: string };
      this.client = new JWT({
        email: sa.client_email, key: sa.private_key,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
      this.projectId = sa.project_id;
      this.logger.log(`Push Firebase actives (projet ${sa.project_id})`);
    } catch (e) {
      this.logger.error(`FIREBASE_SERVICE_ACCOUNT illisible (${e instanceof Error ? e.message : String(e)}) : pas de push.`);
    }
  }

  get enabled(): boolean {
    return this.client != null;
  }

  /** Envoie la push ; false si elle n'est pas partie (jamais d'exception). */
  async send(token: string, title: string, body: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { token: access } = await this.client.getAccessToken();
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            android: { ttl: '600s', priority: 'HIGH' },
          },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
      // Corps lu en entier : le vrai code d'erreur FCM est dans details[].errorCode (voir NotificationSender).
      this.logger.warn(`Push refusée (HTTP ${res.status}) : ${(await res.text()).slice(0, 1200)}`);
      return false;
    } catch (e) {
      this.logger.warn(`Push impossible : ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
