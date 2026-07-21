import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizerSpaceService } from './organizer-space.service';
import { OrganizerId } from './organizer.decorator';
import { Auth, Roles } from '../auth/auth.decorator';

/**
 * Espace organisateur — préfixe /club, JAMAIS /admin.
 *
 * Trois barrières indépendantes :
 *  1. @Roles('club') — seuls les organisateurs entrent ici ;
 *  2. @OrganizerId — refuse la requête si le jeton ne porte pas de périmètre ;
 *  3. les services joignent `organizerarchetype` et ne peuvent rien lire hors périmètre.
 *
 * La séparation des préfixes compte autant que le rôle : un futur contrôleur ajouté par erreur
 * sous /admin sera de toute façon fermé aux rôles externes par DEFAULT_BACKOFFICE_ROLES.
 */
@ApiTags('Espace organisateur')
@Auth('admin')
@Roles('club')
@ApiBearerAuth()
@Controller('club')
export class OrganizerSpaceController {
  constructor(private readonly space: OrganizerSpaceService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil de l\'organisateur et consommation du quota' })
  profile(@OrganizerId() organizerId: number) {
    return this.space.profile(organizerId);
  }

  @Get('tournaments')
  @ApiOperation({ summary: 'Mes tournois récurrents' })
  myArchetypes(@OrganizerId() organizerId: number) {
    return this.space.myArchetypes(organizerId);
  }

  @Post('tournaments')
  @ApiOperation({ summary: 'Créer un tournoi (quota vérifié)' })
  create(@OrganizerId() organizerId: number, @Body() body: Record<string, unknown>) {
    return this.space.createTournament(organizerId, body);
  }

  @Patch('tournaments/:id/active')
  @ApiOperation({ summary: 'Activer / suspendre la planification d\'un de mes tournois' })
  setActive(
    @OrganizerId() organizerId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { active: boolean },
  ) {
    return this.space.setArchetypeActive(organizerId, id, !!body?.active);
  }

  @Get('results')
  @ApiOperation({ summary: 'Éditions jouées de mes tournois' })
  results(@OrganizerId() organizerId: number, @Query('archetypeId') archetypeId?: string) {
    const id = archetypeId ? Number(archetypeId) : undefined;
    return this.space.myResults(organizerId, Number.isInteger(id) ? id : undefined);
  }

  @Get('results/:tournamentId')
  @ApiOperation({ summary: 'Classement et gains d\'une édition' })
  ranking(
    @OrganizerId() organizerId: number,
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.space.tournamentRanking(organizerId, tournamentId);
  }
}
