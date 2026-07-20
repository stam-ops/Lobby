import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { TournamentArchetypeController } from './tournament-archetype.controller';
import { TournamentArchetypeService } from './tournament-archetype.service';

@Module({
  controllers: [CatalogController, TournamentArchetypeController],
  providers: [CatalogService, TournamentArchetypeService],
})
export class CatalogModule {}
