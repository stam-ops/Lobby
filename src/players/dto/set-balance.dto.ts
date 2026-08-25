import { ApiProperty } from '@nestjs/swagger';

export class SetBalanceDto {
  @ApiProperty({ description: 'Nouveau solde de jetons (playeraccount.amount), entier >= 0' })
  amount: number;
}
