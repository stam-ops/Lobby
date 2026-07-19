import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ClientVersionController } from './client-version.controller';
import { ClientVersionService } from './client-version.service';
import { PromoController } from './promo.controller';
import { PromoService } from './promo.service';
import { BonusController } from './bonus.controller';
import { BonusService } from './bonus.service';

@Module({
  controllers: [SettingsController, ClientVersionController, PromoController, BonusController],
  providers: [SettingsService, ClientVersionService, PromoService, BonusService],
})
export class SettingsModule {}
