import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsSentService } from './notifications-sent.service';
import { NotificationSentListDto } from './dto/notification-sent.dto';
import { Auth } from '../auth/auth.decorator';

const parseIntOpt = (v?: string): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

@ApiTags('Notifications envoyées (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/notifications-sent')
export class NotificationsSentController {
  constructor(private readonly notifications: NotificationsSentService) {}

  // Placé AVANT la route paginée n'est pas nécessaire ici (pas de param dynamique), mais on garde
  // l'ordre lookups-puis-liste par cohérence avec les autres contrôleurs.
  @Get('codes')
  @ApiOperation({ summary: 'Codes de notification réellement présents en base' })
  codes() {
    return this.notifications.codes();
  }

  @Get()
  @ApiOperation({
    summary: 'Notifications push envoyées (notificationsentpoker) + pseudo + tournoi lié',
  })
  @ApiQuery({ name: 'player', required: false, description: 'pseudo ou playerId' })
  @ApiQuery({ name: 'code', required: false, description: 'NotificationType, ou 100 = rappel tournoi' })
  @ApiResponse({ status: 200, type: NotificationSentListDto })
  list(
    @Query('player', new DefaultValuePipe('')) player: string,
    @Query('code') code: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.notifications.list(
      player.trim(), parseIntOpt(code), Math.min(limit, 200), offset,
    );
  }
}
