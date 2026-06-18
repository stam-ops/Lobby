import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { OfferDto } from './dto/offer.dto';

@ApiTags('Offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @ApiOperation({ summary: "Offres IAP actives (packs P+Cam's + abonnements VIP)" })
  @ApiResponse({ status: 200, type: [OfferDto] })
  @Get()
  getOffers() {
    return this.svc.getOffers();
  }
}
