import { ApiProperty } from '@nestjs/swagger';

export class PaymentRowDto {
  @ApiProperty() paymentPokerId: number;
  @ApiProperty({ nullable: true }) ts: string;
  @ApiProperty() playerId: number;
  @ApiProperty({ nullable: true }) screenName: string;
  @ApiProperty() platform: string;
  @ApiProperty() productId: string;
  @ApiProperty() productType: number;
  @ApiProperty() orderId: string;
  @ApiProperty() subKey: string;
  @ApiProperty({ description: 'Paiement validé' }) validated: boolean;
  @ApiProperty({ nullable: true, description: 'Prix en centimes (offer.pricecents)' }) priceCents: number;
  @ApiProperty({ nullable: true }) currency: string;
}

export class PaymentListDto {
  @ApiProperty({ type: [PaymentRowDto] }) items: PaymentRowDto[];
  @ApiProperty() total: number;
}

export class SubscriptionRowDto {
  @ApiProperty() playerSubscriptionId: number;
  @ApiProperty() playerId: number;
  @ApiProperty({ nullable: true }) screenName: string;
  @ApiProperty() platform: string;
  @ApiProperty() productId: string;
  @ApiProperty() subKey: string;
  @ApiProperty({ description: 'Expiration (epoch)' }) expiryTs: number;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) createdTs: string;
  @ApiProperty({ nullable: true }) updatedTs: string;
  @ApiProperty({ nullable: true, description: 'Prix en centimes (offer.pricecents)' }) priceCents: number;
  @ApiProperty({ nullable: true }) currency: string;
}

export class SubscriptionListDto {
  @ApiProperty({ type: [SubscriptionRowDto] }) items: SubscriptionRowDto[];
  @ApiProperty() total: number;
}
