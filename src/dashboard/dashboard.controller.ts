import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardDto } from './dto/dashboard.dto';
import { Auth } from '../auth/auth.decorator';

@ApiTags('Dashboard (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Métriques + séries par jour (joueurs actifs / nouveaux)' })
  @ApiQuery({ name: 'days', required: false, enum: [7, 30, 90], description: 'Période des séries (défaut 30)' })
  @ApiResponse({ status: 200, type: DashboardDto })
  data(@Query('days') daysStr: string) {
    const d = Number(daysStr);
    const days = [7, 30, 90].includes(d) ? d : 30;
    return this.dashboard.data(days);
  }
}
