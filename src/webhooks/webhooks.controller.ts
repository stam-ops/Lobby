import { Body, Controller, ForbiddenException, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

/**
 * Endpoints PUBLICS appelés par les stores (pas d'auth joueur) :
 *  - Google : Pub/Sub push (RTDN). Protégé par un secret dans l'URL (?token=...) configuré à la
 *    création de la push subscription.
 *  - Apple  : App Store Server Notifications V2. La confiance vient du re-fetch autoritatif côté service
 *    (App Store Server API) ; un secret d'URL optionnel peut être ajouté.
 * Répondre 200 rapidement (le store ré-essaie sinon).
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService, private readonly config: ConfigService) {}

  @Post('google/rtdn')
  async google(@Query('token') token: string, @Body() body: any) {
    const expected = this.config.get<string>('WEBHOOK_GOOGLE_TOKEN');
    if (!expected || token !== expected) throw new ForbiddenException();
    await this.svc.handleGoogleRtdn(body);
    return {}; // 200 → ack Pub/Sub
  }

  @Post('apple/notifications')
  async apple(@Query('token') token: string, @Body() body: any) {
    const expected = this.config.get<string>('WEBHOOK_APPLE_TOKEN');
    if (expected && token !== expected) throw new ForbiddenException(); // optionnel
    await this.svc.handleAppleNotification(body);
    return {};
  }
}
