import { Body, Controller, Get, Headers, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import { ChanceService } from './chance.service';
import {
  ChanceCampokConfirmDto, ChanceCampokHandsDto, ChanceCampokRequestDto, ChanceIpDto, ChanceLoginConfirmDto, ChanceLoginRequestDto,
  ChanceTokenDto, ChanceUpdateDto, ChanceVipCheckoutDto, ChanceAnalyseCheckoutDto,
} from './dto/chance.dto';

const SESSION_HEADER = 'x-chance-session';

/**
 * Comptes du Chance-o-mètre, appelés par SON serveur seulement (clé CHANCE_PARTNER_KEY en
 * `Authorization: Bearer`), jamais par un navigateur : pas de CORS, adresse de LobbyWS jamais
 * montrée aux visiteurs. La session du visiteur arrive dans l'en-tête X-Chance-Session ; le serveur
 * du Chance-o-mètre la garde dans un cookie HttpOnly sur son propre domaine.
 */
@ApiTags('Chance-o-mètre (partenaire)')
@Auth('partner')
@ApiBearerAuth()
@Controller('chance')
export class ChanceController {
  constructor(private readonly chance: ChanceService) {}

  @Post('login/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envoie le lien de connexion (ou de création de compte) par e-mail' })
  requestLogin(@Body() dto: ChanceLoginRequestDto) {
    return this.chance.requestLogin(dto);
  }

  @Post('login/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lien ou code reçu par e-mail → session (crée le compte à la première fois)' })
  confirmLogin(@Body() dto: ChanceLoginConfirmDto) {
    return this.chance.confirmLogin(dto);
  }

  @Get('me')
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Profil ; session renouvelée si elle a plus d’un jour' })
  me(@Headers(SESSION_HEADER) session: string) {
    return this.chance.me(session);
  }

  @Patch('me')
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Case « nouvelles » (liste Mailjet)' })
  update(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceUpdateDto) {
    return this.chance.update(session, dto);
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Se déconnecter partout : toutes les sessions du compte tombent' })
  logoutAll(@Headers(SESSION_HEADER) session: string) {
    return this.chance.logoutAll(session);
  }

  @Post('campok/request')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Code de liaison envoyé en notification interne (et push) au joueur Campok de ce pseudo' })
  requestCampokLink(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceCampokRequestDto) {
    return this.chance.requestCampokLink(session, dto);
  }

  @Post('campok/confirm')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Code tapé sur la page → compte Campok relié (offre 2)' })
  confirmCampokLink(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceCampokConfirmDto) {
    return this.chance.confirmCampokLink(session, dto);
  }

  @Post('vip/checkout')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Page de paiement Stripe du Campok VIP (joueur relié, pas déjà VIP) → { url }' })
  vipCheckout(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceVipCheckoutDto) {
    return this.chance.vipCheckout(session, dto.plan);
  }

  @Post('analyse/checkout')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Page de paiement Stripe de l’offre Analyse (pas déjà en cours) → { url }' })
  analyseCheckout(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceAnalyseCheckoutDto) {
    return this.chance.analyseCheckout(session, dto.plan);
  }

  @Post('analyse/cancel')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Résilie l’abonnement de l’offre Analyse (fin de la période en cours) → { user }' })
  analyseCancel(@Headers(SESSION_HEADER) session: string) {
    return this.chance.analyseCancel(session);
  }

  @Post('vip/cancel')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Résilie l’abonnement VIP web (fin de la période en cours) → { user }' })
  vipCancel(@Headers(SESSION_HEADER) session: string) {
    return this.chance.vipCancel(session);
  }

  @Post('campok/unlink')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Délie le compte Campok' })
  unlinkCampok(@Headers(SESSION_HEADER) session: string) {
    return this.chance.unlinkCampok(session);
  }

  @Post('campok/hands')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Mains Campok du joueur relié (offre 2) : une ligne JSON par main, cartes adverses montrées seulement' })
  campokHands(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceCampokHandsDto) {
    return this.chance.campokHands(session, dto);
  }

  @Post('delete/request')
  @HttpCode(200)
  @ApiHeader({ name: SESSION_HEADER })
  @ApiOperation({ summary: 'Envoie le lien de confirmation de suppression du compte' })
  requestDelete(@Headers(SESSION_HEADER) session: string, @Body() dto: ChanceIpDto) {
    return this.chance.requestDelete(session, dto.ip);
  }

  @Post('delete/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Supprime le compte (lien reçu par e-mail) ; renvoie son id' })
  confirmDelete(@Body() dto: ChanceTokenDto) {
    return this.chance.confirmDelete(dto);
  }
}
