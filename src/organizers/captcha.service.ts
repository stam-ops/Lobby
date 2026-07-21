import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Vérification du captcha protégeant le formulaire public d'inscription.
 *
 * Implémenté pour Cloudflare Turnstile, mais l'URL est configurable : hCaptcha et reCAPTCHA
 * exposent le même contrat (POST form-encoded { secret, response } → { success: boolean }).
 *
 * ⚠️ Sans CAPTCHA_SECRET, la vérification est DÉSACTIVÉE et laisse tout passer. Acceptable en
 * développement, à proscrire en production : c'est la seule barrière contre la création de comptes
 * en masse, la limite de débit ne faisant que ralentir un attaquant distribué. Le démarrage
 * journalise un avertissement pour éviter une mise en production silencieuse sans captcha.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secret?: string;
  private readonly verifyUrl: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>('CAPTCHA_SECRET');
    this.verifyUrl = this.config.get<string>(
      'CAPTCHA_VERIFY_URL',
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    if (!this.secret) {
      this.logger.warn('CAPTCHA_SECRET absent — la vérification captcha est DÉSACTIVÉE.');
    }
  }

  get enabled(): boolean {
    return !!this.secret;
  }

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.secret) return true;
    if (!token) return false;

    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    try {
      const res = await fetch(this.verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        // Un prestataire lent ne doit pas bloquer un worker : au-delà, on refuse.
        signal: AbortSignal.timeout(5000),
      });
      const json = (await res.json()) as { success?: boolean };
      return json.success === true;
    } catch (e) {
      // Panne du prestataire : on REFUSE (fail-closed). Accepter reviendrait à supprimer la
      // protection au moment précis où un attaquant pourrait la saturer.
      this.logger.error(`Vérification captcha impossible : ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
