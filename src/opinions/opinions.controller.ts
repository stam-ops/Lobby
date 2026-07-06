import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OpinionsService } from './opinions.service';
import { OpinionListDto } from './dto/opinion.dto';
import { Auth } from '../auth/auth.decorator';

@ApiTags('Opinions (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/opinions')
export class OpinionsController {
  constructor(private readonly opinions: OpinionsService) {}

  @Get()
  @ApiOperation({ summary: 'Avis internes des joueurs (playeropinion)' })
  @ApiQuery({ name: 'search', required: false, description: 'pseudo ou playerId' })
  @ApiResponse({ status: 200, type: OpinionListDto })
  list(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.opinions.list(search.trim(), Math.min(limit, 200), offset);
  }
}
