import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ClientVersionController } from './client-version.controller';
import { ClientVersionService } from './client-version.service';
import { PromoController } from './promo.controller';
import { PromoService } from './promo.service';

@Module({
  controllers: [SettingsController, ClientVersionController, PromoController],
  providers: [SettingsService, ClientVersionService, PromoService],
})
export class SettingsModule {}
