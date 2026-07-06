import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Métriques + séries 30 jours (joueurs actifs / nouveaux)' })
  @ApiResponse({ status: 200, type: DashboardDto })
  data() {
    return this.dashboard.data();
  }
}
