import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../auth/auth.decorator';
import { BotsService } from './bots.service';

@ApiTags('Bots (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/bots')
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Get('parameters')
  @ApiOperation({ summary: 'Parametres globaux des bots' })
  getParameters() {
    return this.bots.getParameters();
  }

  @Patch('parameters')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier les parametres (flags = 0/1 ; sngseedbots/maxonlineforbots acceptent -1)' })
  updateParameters(@Body() patch: Record<string, unknown>) {
    return this.bots.updateParameters(patch);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Pool de comptes bots + soldes (P / Cam\'s)' })
  listAccounts() {
    return this.bots.listAccounts();
  }

  @Post('accounts')
  @Roles('admin')
  @ApiOperation({ summary: 'Ajouter un compte au pool (playerId existant)' })
  addAccount(@Body() body: { playerId: number; sex?: number; level?: number }) {
    return this.bots.addAccount(Number(body.playerId), Number(body.sex ?? 0), Number(body.level ?? 1));
  }

  @Patch('accounts/:playerId')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier sexe / actif d\'un compte bot' })
  updateAccount(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() body: { sex?: number; active?: number; level?: number },
  ) {
    return this.bots.updateAccount(playerId, body.sex, body.active, body.level);
  }

  @Delete('accounts/:playerId')
  @Roles('admin')
  @ApiOperation({ summary: 'Retirer un compte du pool' })
  deleteAccount(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.bots.deleteAccount(playerId);
  }

  @Post('accounts/:playerId/topup')
  @Roles('admin')
  @ApiOperation({ summary: 'Provisionner (+/-) P et/ou Cam\'s du compte bot' })
  topup(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() body: { amount?: number; cams?: number },
  ) {
    return this.bots.topup(playerId, Number(body.amount ?? 0), Number(body.cams ?? 0));
  }
}
