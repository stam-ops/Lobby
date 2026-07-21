import { Module } from '@nestjs/common';
import { ClubService } from './club.service';
import { ClubController } from './club.controller';
import { OrganizerSpaceController } from './organizer-space.controller';
import { OrganizerSpaceService } from './organizer-space.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [ClubController, OrganizerSpaceController],
  providers: [ClubService, OrganizerSpaceService],
})
export class ClubModule {}
