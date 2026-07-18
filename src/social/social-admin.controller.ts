import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SocialAdminService } from './social-admin.service';
import { CampokeListDto, FriendRelationListDto } from './dto/campoke.dto';
import { Auth } from '../auth/auth.decorator';

const intOpt = (v?: string): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

@ApiTags('Social (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin')
export class SocialAdminController {
  constructor(private readonly socialAdmin: SocialAdminService) {}

  @Get('campokes')
  @ApiOperation({ summary: 'Campokes envoyés entre joueurs' })
  @ApiQuery({ name: 'search', required: false, description: 'pseudo ou playerId (émetteur ou destinataire)' })
  @ApiQuery({ name: 'type', required: false, description: 'CampokeInvitationType' })
  @ApiResponse({ status: 200, type: CampokeListDto })
  campokes(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('type') type: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.socialAdmin.campokes(search.trim(), intOpt(type), Math.min(limit, 200), offset);
  }

  @Get('friend-relations')
  @ApiOperation({ summary: 'Relations d\'amitié entre joueurs' })
  @ApiQuery({ name: 'search', required: false, description: 'pseudo ou playerId (invitant ou invité)' })
  @ApiQuery({ name: 'state', required: false, description: 'FriendRelationState' })
  @ApiResponse({ status: 200, type: FriendRelationListDto })
  friendRelations(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('state') state: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.socialAdmin.friendRelations(search.trim(), intOpt(state), Math.min(limit, 200), offset);
  }
}
