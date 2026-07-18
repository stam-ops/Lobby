import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { SocialAdminService } from './social-admin.service';
import { SocialAdminController } from './social-admin.controller';

@Module({
  controllers: [SocialController, SocialAdminController],
  providers: [SocialService, SocialAdminService],
})
export class SocialModule {}
