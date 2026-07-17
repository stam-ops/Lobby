import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ClientVersionController } from './client-version.controller';
import { ClientVersionService } from './client-version.service';

@Module({
  controllers: [SettingsController, ClientVersionController],
  providers: [SettingsService, ClientVersionService],
})
export class SettingsModule {}
