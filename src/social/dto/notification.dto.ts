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
}
