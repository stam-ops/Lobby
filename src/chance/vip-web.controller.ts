import { BadRequestException, Controller, Headers, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorator';
import { VipWebService } from './vip-web.service';

/**
 * Webhook Stripe du VIP vendu sur le Chance-o-mètre (vip-web.service.ts). Public : la confiance vient de la signature
 * Stripe-Signature, vérifiée sur le corps brut (NestFactory.create(…, { rawBody: true }) dans main.ts).
 * À déclarer dans Stripe : https://<LobbyWS>/webhooks/stripe, événements checkout.session.completed,
 * checkout.session.async_payment_succeeded, invoice.paid, customer.subscription.updated, customer.subscription.deleted.
 */
@Public()
@ApiExcludeController()
@Controller('webhooks')
export class VipWebController {
  constructor(private readonly vip: VipWebService) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!(await this.vip.webhook(req.rawBody, signature))) throw new BadRequestException('Signature refusée.');
    return { received: true };
  }
}
