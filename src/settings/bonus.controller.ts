import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BonusService } from './bonus.service';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Config (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/bonus')
export class BonusController {
  constructor(private readonly bonus: BonusService) {}

  @Get()
  @ApiOperation({ summary: 'Table bonus (une ligne par BonusType)' })
  list() {
    return this.bonus.list();
  }

  @Patch(':bonusId')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier les valeurs d\'un bonus (socialXpVal, pokerXpVal, bankrollVal, cams)' })
  update(@Param('bonusId', ParseIntPipe) bonusId: number, @Body() patch: Record<string, unknown>) {
    return this.bonus.update(bonusId, patch);
  }
}
