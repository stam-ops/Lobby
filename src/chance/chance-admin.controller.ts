import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth, Roles, Strict } from '../auth/auth.decorator';
import { AnalyseWebService } from './analyse-web.service';
import { ChanceService } from './chance.service';

/**
 * Suivi des comptes du Chance-o-mètre dans le backoffice Campok. Personnel interne seulement
 * (admin, support : défaut sans @Roles), jamais les organisateurs ('club') : la liste contient des
 * adresses e-mail. @Strict : refusé sans jeton valide même si AUTH_ENFORCE n'est pas 'true'.
 */
@ApiTags('Chance-o-mètre (backoffice)')
@Auth('admin')
@Strict()
@ApiBearerAuth()
@Controller('admin/chance')
export class ChanceAdminController {
  constructor(private readonly chance: ChanceService, private readonly analyse: AnalyseWebService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Comptes, inscrits aux nouvelles, reliés à Campok, actifs, créations par jour (30 j)' })
  stats() {
    return this.chance.stats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Liste des comptes (recherche par e-mail, pagination)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'À partir de 0' })
  @ApiQuery({ name: 'pageSize', required: false, description: '200 au plus' })
  @ApiQuery({ name: 'state', required: false, description: 'campok | nocampok | vip | analyse | newsletter' })
  @ApiQuery({ name: 'campok', required: false, description: 'Pseudo Campok du compte relié' })
  @ApiQuery({ name: 'site', required: false, description: 'Salle du pseudo (Winamax, PokerStars, Betclic, PMU)' })
  @ApiQuery({ name: 'pseudo', required: false, description: 'Pseudo de la salle (cherché par son empreinte)' })
  list(
    @Query('search') search = '',
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
    @Query('state') state = '',
    @Query('campok') campok = '',
    @Query('site') site = '',
    @Query('pseudo') pseudo = '',
  ) {
    return this.chance.list(search, page, pageSize, { state, campok, site, pseudo });
  }

  @Get('analyse/sales')
  @ApiOperation({ summary: 'Ventes de l’offre Analyse : totaux par formule, offres et abonnements en cours, 12 derniers mois, paiements' })
  @ApiQuery({ name: 'search', required: false, description: 'E-mail du compte' })
  @ApiQuery({ name: 'page', required: false, description: 'À partir de 0' })
  @ApiQuery({ name: 'pageSize', required: false, description: '200 au plus' })
  sales(
    @Query('search') search = '',
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.analyse.adminSales(search, page, pageSize);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Fiche d’un compte : offres, achats, bilan de chance, mains du module d’analyse, profil de jeu' })
  @ApiQuery({ name: 'site', required: false, description: 'Salle du profil de jeu et des erreurs (toutes sinon)' })
  detail(@Param('id', ParseIntPipe) id: number, @Query('site') site = '') {
    return this.chance.adminDetail(id, site || null);
  }

  @Delete('users/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprime un compte et ses données du service public (demande d’effacement, essais)' })
  @ApiQuery({ name: 'pseudos', required: false, description: 'bloquer (défaut, comme une suppression par le joueur) | liberer' })
  remove(@Param('id', ParseIntPipe) id: number, @Query('pseudos') pseudos = '') {
    return this.chance.adminDelete(id, pseudos === 'liberer' ? 'liberer' : 'bloquer');
  }

  @Post('users/:id/release-pseudos')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Libère tous les pseudos des salles rattachés à un compte (ses mains restent)' })
  releasePseudos(@Param('id', ParseIntPipe) id: number) {
    return this.chance.adminReleasePseudos(id);
  }

  @Post('pseudo/release')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Libère le pseudo d’une salle, bloqué ou rattaché à un compte (support, essais)' })
  releasePseudo(@Body() body: { site?: string; pseudo?: string }) {
    return this.chance.adminReleasePseudo(String(body?.site ?? ''), String(body?.pseudo ?? ''));
  }
}
