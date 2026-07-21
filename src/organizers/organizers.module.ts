import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrganizerSignupController } from './organizer-signup.controller';
import { OrganizerSignupService } from './organizer-signup.service';
import { OrganizersAdminController } from './organizers-admin.controller';
import { OrganizersAdminService } from './organizers-admin.service';
import { MailService } from './mail.service';
import { CaptchaService } from './captcha.service';

/**
 * Inscription publique des organisateurs de tournois.
 *
 * JwtModule est importé sans secret : les jetons de vérification sont signés avec un secret passé
 * explicitement à chaque appel (EMAIL_TOKEN_SECRET), distinct de celui de l'authentification.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [OrganizerSignupController, OrganizersAdminController],
  providers: [OrganizerSignupService, OrganizersAdminService, MailService, CaptchaService],
  exports: [MailService],
})
export class OrganizersModule {}
