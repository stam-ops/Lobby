import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardDto, MonthCountDto } from './dto/dashboard.dto';
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

  @Get('mau')
  @ApiOperation({ summary: 'Monthly Active Users (6/12/24 mois)' })
  @ApiQuery({ name: 'months', required: false, enum: [6, 12, 24], description: 'Période (défaut 12)' })
  @ApiResponse({ status: 200, type: [MonthCountDto] })
  mau(@Query('months') monthsStr: string) {
    const m = Number(monthsStr);
    const months = [6, 12, 24].includes(m) ? m : 12;
    return this.dashboard.mau(months);
  }
}
