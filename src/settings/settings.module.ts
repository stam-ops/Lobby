import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ClientVersionController } from './client-version.controller';
import { ClientVersionService } from './client-version.service';
import { PromoController } from './promo.controller';
import { PromoService } from './promo.service';
import { BonusController } from './bonus.controller';
import { BonusService } from './bonus.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [
    SettingsController, ClientVersionController, PromoController, BonusController, ModerationController,
  ],
  providers: [SettingsService, ClientVersionService, PromoService, BonusService, ModerationService],
})
export class SettingsModule {}
