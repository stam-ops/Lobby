import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PaymentListDto, SubscriptionListDto } from './dto/payment.dto';
import { Auth } from '../auth/auth.decorator';

@ApiTags('Payments (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  @ApiOperation({ summary: 'Paiements reçus (paymentpoker)' })
  @ApiQuery({ name: 'search', required: false, description: 'pseudo, playerId ou orderId' })
  @ApiResponse({ status: 200, type: PaymentListDto })
  paymentsList(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.payments.payments(search.trim(), Math.min(limit, 200), offset);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Abonnements (playersubscription)' })
  @ApiQuery({ name: 'search', required: false, description: 'pseudo ou playerId' })
  @ApiResponse({ status: 200, type: SubscriptionListDto })
  subscriptionsList(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.payments.subscriptions(search.trim(), Math.min(limit, 200), offset);
  }
}
