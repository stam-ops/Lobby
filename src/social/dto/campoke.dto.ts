import { ApiProperty } from '@nestjs/swagger';

export class CampokeRowDto {
  @ApiProperty() campokeId: number;
  @ApiProperty() playerIdFrom: number;
  @ApiProperty({ nullable: true }) screenNameFrom: string;
  @ApiProperty({ nullable: true }) playerIdTo: number;
  @ApiProperty({ nullable: true }) screenNameTo: string;
  @ApiProperty({ description: 'CampokeInvitationType : 0=texte, 1=CG privée, 2=cash, 3=tournoi, 4=SNG' })
  invitationType: number;
  @ApiProperty({ nullable: true }) message: string;
  @ApiProperty({ nullable: true }) tournamentId: number;
  @ApiProperty({ nullable: true }) gameTableId: number;
}

export class CampokeListDto {
  @ApiProperty({ type: [CampokeRowDto] }) items: CampokeRowDto[];
  @ApiProperty() total: number;
}

export class FriendRelationRowDto {
  @ApiProperty() friendRelationId: number;
  @ApiProperty() playerIdFrom: number;
  @ApiProperty({ nullable: true }) screenNameFrom: string;
  @ApiProperty() playerIdTo: number;
  @ApiProperty({ nullable: true }) screenNameTo: string;
  @ApiProperty({ description: 'FriendRelationState : 0=ami, 1=pas ami, 2=en attente, 3=en attente (moi), 4=bloqué' })
  state: number;
}

export class FriendRelationListDto {
  @ApiProperty({ type: [FriendRelationRowDto] }) items: FriendRelationRowDto[];
  @ApiProperty() total: number;
}
