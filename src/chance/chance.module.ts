import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrganizersModule } from '../organizers/organizers.module';
import { ChanceController } from './chance.controller';
import { ChanceAdminController } from './chance-admin.controller';
import { ChanceService } from './chance.service';
import { MailjetService } from './mailjet.service';

/**
 * Comptes du Chance-o-mètre (sql/002_chance.sql). JwtModule sans secret : les sessions sont signées
 * avec CHANCE_SESSION_SECRET passé à chaque appel, jamais avec JWT_SECRET (backoffice).
 * MailService (SMTP) et CaptchaService (Turnstile) sont repris du module des organisateurs.
 */
@Module({
  imports: [JwtModule.register({}), OrganizersModule],
  controllers: [ChanceController, ChanceAdminController],
  providers: [ChanceService, MailjetService],
})
export class ChanceModule {}
