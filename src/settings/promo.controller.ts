import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromoService } from './promo.service';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Config (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/promos')
export class PromoController {
  constructor(private readonly promos: PromoService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des promos (+ nb de codes et de joueurs rattachés)' })
  list() {
    return this.promos.promos();
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Ajouter une promo' })
  add(@Body() body: { name: string; credits: number; premiums: number; cams: number }) {
    return this.promos.addPromo({
      name: body?.name ?? '',
      credits: Number(body?.credits ?? 0),
      premiums: Number(body?.premiums ?? 0),
      cams: Number(body?.cams ?? 0),
    });
  }

  @Delete(':promoId')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprimer une promo (refusée si utilisée ou consommée)' })
  remove(@Param('promoId', ParseIntPipe) promoId: number) {
    return this.promos.deletePromo(promoId);
  }

  @Get(':promoId/codes')
  @ApiOperation({ summary: 'Codes d\'une promo' })
  codes(@Param('promoId', ParseIntPipe) promoId: number) {
    return this.promos.codes(promoId);
  }

  @Post(':promoId/codes')
  @Roles('admin')
  @ApiOperation({ summary: 'Ajouter un code à une promo' })
  addCode(
    @Param('promoId', ParseIntPipe) promoId: number,
    @Body() body: { code: string; codeLimit: number },
  ) {
    return this.promos.addCode(promoId, body?.code, Number(body?.codeLimit ?? 0));
  }

  @Get('codes/:codePromoId/players')
  @ApiOperation({ summary: 'Joueurs ayant utilisé un code promo' })
  codePlayers(@Param('codePromoId', ParseIntPipe) codePromoId: number) {
    return this.promos.codePlayers(codePromoId);
  }

  @Patch('codes/:codePromoId')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier la limite d\'utilisation d\'un code' })
  setLimit(
    @Param('codePromoId', ParseIntPipe) codePromoId: number,
    @Body() body: { codeLimit: number },
  ) {
    return this.promos.setCodeLimit(codePromoId, Number(body?.codeLimit));
  }

  @Delete('codes/:codePromoId')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprimer un code (refusé si déjà consommé)' })
  removeCode(@Param('codePromoId', ParseIntPipe) codePromoId: number) {
    return this.promos.deleteCode(codePromoId);
  }
}
