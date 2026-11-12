import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrganizersModule } from '../organizers/organizers.module';
import { ChanceController } from './chance.controller';
import { ChanceAdminController } from './chance-admin.controller';
import { ChanceService } from './chance.service';
import { MailjetService } from './mailjet.service';
import { FcmService } from './fcm.service';
import { VipWebController } from './vip-web.controller';
import { VipWebService } from './vip-web.service';

/**
 * Comptes du Chance-o-mètre (sql/002_chance.sql). JwtModule sans secret : les sessions sont signées
 * avec CHANCE_SESSION_SECRET passé à chaque appel, jamais avec JWT_SECRET (backoffice).
 * MailService (SMTP) et CaptchaService (Turnstile) sont repris du module des organisateurs.
 * VipWebService : Campok VIP vendu sur le Chance-o-mètre (Stripe), webhook public /webhooks/stripe.
 */
@Module({
  imports: [JwtModule.register({}), OrganizersModule],
  controllers: [ChanceController, ChanceAdminController, VipWebController],
  providers: [ChanceService, MailjetService, FcmService, VipWebService],
})
export class ChanceModule {}
