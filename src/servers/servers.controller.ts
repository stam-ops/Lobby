import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ServersService } from './servers.service';
import { FrontServerDto, SipServerDto } from './dto/server.dto';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Servers (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get('fronts')
  @ApiOperation({ summary: 'Liste des serveurs Front (actif = endts vaut 0)' })
  @ApiResponse({ status: 200, type: [FrontServerDto] })
  fronts() {
    return this.servers.fronts();
  }

  @Patch('fronts/:frontId')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier la capacité max de connexions d\'un front' })
  setFrontMax(
    @Param('frontId', ParseIntPipe) frontId: number,
    @Body() body: { maxConnection: number },
  ) {
    return this.servers.setFrontMaxConnection(frontId, Number(body?.maxConnection));
  }

  @Get('sip')
  @ApiOperation({ summary: 'Liste des SipServers (actif = heartbeat lastts récent)' })
  @ApiResponse({ status: 200, type: [SipServerDto] })
  sip() {
    return this.servers.sipServers();
  }
}
