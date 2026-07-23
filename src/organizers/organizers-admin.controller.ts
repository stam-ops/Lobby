import {
  Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrganizersAdminService } from './organizers-admin.service';
import { Auth, Roles } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

/**
 * File de validation des organisateurs — personnel interne uniquement.
 *
 * Réservé au rôle 'admin' : valider un organisateur revient à lui ouvrir la création de tournois
 * en production, ce n'est pas une action de support.
 */
@ApiTags('Organisateurs (backoffice)')
@Auth('admin')
@Roles('admin')
@ApiBearerAuth()
@Controller('admin/organizers')
export class OrganizersAdminController {
  constructor(private readonly organizers: OrganizersAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des organisateurs (dossiers en attente inclus)' })
  @ApiQuery({ name: 'status', required: false, description: 'pending | active | all' })
  list(@Query('status', new DefaultValuePipe('all')) status: string) {
    return this.organizers.list(status);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Demandes des organisateurs (relèvement de seuils)' })
  @ApiQuery({ name: 'status', required: false, description: 'pending | handled | all' })
  listRequests(@Query('status', new DefaultValuePipe('pending')) status: string) {
    return this.organizers.listRequests(status);
  }

  @Patch('requests/:id/handled')
  @ApiOperation({ summary: 'Marque une demande comme traitée, ou la rouvre' })
  async setRequestHandled(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { handled: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    await this.organizers.setRequestHandled(id, !!body?.handled, user?.adminId);
    return this.organizers.listRequests('all');
  }

  @Patch(':id/active')
  @ApiOperation({ summary: "Valide ou suspend un organisateur (organizer + compte backoffice)" })
  async setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { active: boolean },
  ) {
    await this.organizers.setActive(id, !!body?.active);
    return this.organizers.list('all');
  }

  @Patch(':id/quota')
  @ApiOperation({ summary: 'Ajuste les quotas (0 = illimité)' })
  async setQuota(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { maxTournamentsPerMonth: number; maxPlayersPerTournament: number },
  ) {
    await this.organizers.setQuota(
      id, Number(body?.maxTournamentsPerMonth), Number(body?.maxPlayersPerTournament),
    );
    return this.organizers.list('all');
  }

  @Post(':id/resend-verification')
  @ApiOperation({ summary: 'Renvoie le lien de confirmation d\'adresse' })
  resend(@Param('id', ParseIntPipe) id: number) {
    return this.organizers.resendVerification(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un dossier refusé (impossible s\'il a déjà des tournois)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.organizers.remove(id);
    return { ok: true };
  }
}
