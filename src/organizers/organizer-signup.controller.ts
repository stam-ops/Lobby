import {
  BadRequestException, Body, Controller, Get, Ip, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizerSignupService } from './organizer-signup.service';
import { CaptchaService } from './captcha.service';
import { Public } from '../auth/auth.decorator';
import { OrganizerSignupDto } from './dto/organizer-signup.dto';

/**
 * Surface PUBLIQUE d'inscription des organisateurs. Aucune donnée n'est lue ici : ces routes
 * écrivent une demande, rien de plus. Toute lecture passe par /club/* (compte validé) ou /admin/*.
 */
@ApiTags('Organisateurs (public)')
// Guard posé ICI et pas en global : une limite globale s'appliquerait aussi aux routes de l'app,
// qui interroge le lobby en continu et se ferait throttler.
@UseGuards(ThrottlerGuard)
@Controller('public/organizers')
export class OrganizerSignupController {
  constructor(
    private readonly signup: OrganizerSignupService,
    private readonly captcha: CaptchaService,
  ) {}

  @Public()
  // 5 tentatives par minute et par IP : large pour un humain, contraignant pour un script. Le
  // captcha reste la barrière principale, la limite de débit ne fait que borner le coût.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @ApiOperation({ summary: "Demande de création d'un espace organisateur" })
  async register(@Body() body: OrganizerSignupDto, @Ip() ip: string) {
    if (!(await this.captcha.verify(body.captchaToken, ip))) {
      throw new BadRequestException('Vérification anti-robot échouée. Merci de réessayer.');
    }
    await this.signup.signup(body.organizationName, body.email, body.password);
    // Réponse identique que l'adresse ait été retenue ou déjà connue — pas d'énumération.
    return {
      message: 'Si cette adresse est disponible, un e-mail de confirmation vient de vous être envoyé.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('verify-email')
  @ApiOperation({ summary: "Confirme l'adresse e-mail via le lien signé" })
  verify(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Lien invalide.');
    return this.signup.verifyEmail(token);
  }
}
