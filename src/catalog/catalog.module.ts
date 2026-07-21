import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { TournamentArchetypeController } from './tournament-archetype.controller';
import { TournamentArchetypeService } from './tournament-archetype.service';

@Module({
  controllers: [CatalogController, TournamentArchetypeController],
  providers: [CatalogService, TournamentArchetypeService],
  // Exporté pour l'espace organisateur : il réutilise `create`, qui porte tous les garde-fous
  // moteur (shootOut, cadence cash game, buy-in plancher, cohérence type/code d'accès…).
  // Les dupliquer côté organisateur garantirait qu'ils divergent un jour.
  exports: [TournamentArchetypeService],
})
export class CatalogModule {}
