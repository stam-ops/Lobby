import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlacklistService } from './blacklist.service';
import { BlacklistEntryDto } from './dto/blacklist.dto';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Blacklist (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/blacklist')
export class BlacklistController {
  constructor(private readonly blacklist: BlacklistService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Bannir du site : ajoute une entrée blacklist (playerId, connectionId ou ip)' })
  async add(@Body() dto: BlacklistEntryDto) {
    await this.blacklist.add(dto);
    return { ok: true };
  }

  @Delete()
  @Roles('admin')
  @ApiOperation({ summary: 'Lever un ban site : supprime les entrées blacklist correspondantes' })
  async remove(@Body() dto: BlacklistEntryDto) {
    await this.blacklist.remove(dto);
    return { ok: true };
  }
}
