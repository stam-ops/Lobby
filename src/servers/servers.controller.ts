import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ServersService } from './servers.service';
import { FrontServerDto, SipServerDto } from './dto/server.dto';
import { Auth } from '../auth/auth.decorator';

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

  @Get('sip')
  @ApiOperation({ summary: 'Liste des SipServers (actif = heartbeat lastts récent)' })
  @ApiResponse({ status: 200, type: [SipServerDto] })
  sip() {
    return this.servers.sipServers();
  }
}
