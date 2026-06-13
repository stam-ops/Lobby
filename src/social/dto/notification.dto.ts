import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ example: 301, description: 'notification.notificationid' })
  notificationId: number;

  @ApiProperty({ example: 5, description: 'notification.notificationtype' })
  notificationType: number;

  @ApiProperty({ example: 0, description: '0=non lu, 1=lu' })
  isRead: number;

  @ApiProperty({ example: 0, description: '0=non consommé, 1=consommé' })
  isConsumed: number;

  @ApiProperty({ required: false, description: "Autre joueur de la relation (demandes d'ami) — null sinon" })
  fromPlayerId?: number;

  @ApiProperty({ required: false, description: "Pseudo de l'autre joueur (demandes d'ami / campoke)" })
  fromScreenName?: string;

  @ApiProperty({ required: false, description: 'Texte du campoke (notif campokeReceived)' })
  campokeMessage?: string;

  @ApiProperty({ required: false, description: 'Type d\'invitation campoke (CampokeInvitationType)' })
  inviteType?: number;

  @ApiProperty({ required: false, description: 'Table à rejoindre (campoke invitePrivateCash/inviteCash)' })
  gameTableId?: number;
}
