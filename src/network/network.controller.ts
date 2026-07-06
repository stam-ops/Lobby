import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NetworkService } from './network.service';
import { ConnectionListDto, SessionDetailDto, SessionListDto } from './dto/network.dto';
import { Auth } from '../auth/auth.decorator';

/** true/false/undefined depuis un query param string. */
function parseBool(v?: string): boolean | undefined {
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

@ApiTags('Network (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin')
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'Sessions joueur (filtre actives : opened=1 & endts=0)' })
  @ApiQuery({ name: 'active', required: false, description: 'true = actives, false = inactives, absent = toutes' })
  @ApiResponse({ status: 200, type: SessionListDto })
  sessions(
    @Query('active') active: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.network.sessions(parseBool(active), Math.min(limit, 200), offset);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Détail d\'une session + ses connexions' })
  @ApiResponse({ status: 200, type: SessionDetailDto })
  session(@Param('id', ParseIntPipe) id: number) {
    return this.network.session(id);
  }

  @Get('connections')
  @ApiOperation({ summary: 'Connexions (filtres : ouvertes, avec/sans playersession)' })
  @ApiQuery({ name: 'open', required: false, description: 'true = ouvertes (endts=0)' })
  @ApiQuery({ name: 'session', required: false, enum: ['with', 'without'] })
  @ApiResponse({ status: 200, type: ConnectionListDto })
  connections(
    @Query('open') open: string,
    @Query('session') session: 'with' | 'without',
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.network.connections(parseBool(open), session, Math.min(limit, 200), offset);
  }
}
