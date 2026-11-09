import { Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth, Roles, Strict } from '../auth/auth.decorator';
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
  constructor(private readonly chance: ChanceService) {}

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
  list(
    @Query('search') search = '',
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.chance.list(search, page, pageSize);
  }

  @Delete('users/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprime un compte (demande d’effacement reçue par le support)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.chance.adminDelete(id);
  }
}
