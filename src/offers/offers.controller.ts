import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { OffersService } from './offers.service';
import { OfferDto } from './dto/offer.dto';

@ApiTags('Offers')
@Auth('player', 'admin')
@ApiBearerAuth()
@Controller('offers')
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @ApiOperation({ summary: "Offres IAP actives (packs P+Cam's + abonnements VIP)" })
  @ApiResponse({ status: 200, type: [OfferDto] })
  @Get()
  getOffers(@CurrentUser() user?: AuthUser) {
    // Le playerId (résolu par AuthGuard via le sessionHash) permet d'EXCLURE les offres achetables
    // une seule fois déjà possédées (ex. starter pack). undefined (auth log-only) → aucun filtre.
    return this.svc.getOffers(user?.playerId);
  }
}
