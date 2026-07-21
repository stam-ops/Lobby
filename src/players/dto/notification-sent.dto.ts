import { ApiProperty } from '@nestjs/swagger';

export class NotificationSentRowDto {
  @ApiProperty() id: number;
  @ApiProperty({ description: "Horodatage d'envoi (push accepté par FCM)" }) ts: string;
  @ApiProperty() playerId: number;
  @ApiProperty({ nullable: true }) screenName: string | null;
  @ApiProperty({
    description: 'NotificationType (0-22) ou 100 = rappel de tournoi global',
  }) code: number;

  @ApiProperty({ nullable: true }) tournamentId: number | null;
  @ApiProperty({ nullable: true }) tournamentLabel: string | null;
  @ApiProperty({ nullable: true }) tournamentStartTime: string | null;

  @ApiProperty({ nullable: true }) notificationId: number | null;
  @ApiProperty({
    nullable: true,
    description: 'Type de la notification liée. NULL en pratique : aucun site d\'insertion ne renseigne notificationid.',
  }) notificationType: number | null;
  @ApiProperty({ nullable: true }) notificationCreationTs: string | null;
}

export class NotificationSentListDto {
  @ApiProperty({ type: [NotificationSentRowDto] }) items: NotificationSentRowDto[];
  @ApiProperty() total: number;
}
