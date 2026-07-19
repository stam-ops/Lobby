import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModerationService } from './moderation.service';
import { Auth, Roles } from '../auth/auth.decorator';

@ApiTags('Config (backoffice)')
@Auth('admin')
@ApiBearerAuth()
@Controller('admin/banned-words')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  @ApiOperation({ summary: 'Mots bannis du tchat (table bannedword)' })
  list() {
    return this.moderation.list();
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Ajouter un mot banni' })
  add(@Body() body: { word: string; lang: string }) {
    return this.moderation.add(body?.word, body?.lang);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier un mot (texte, langue, activation)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { word?: string; lang?: string; enabled?: boolean },
  ) {
    return this.moderation.update(id, body ?? {});
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprimer un mot banni' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.moderation.remove(id);
  }
}
