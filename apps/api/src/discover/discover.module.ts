import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { GoogleModule } from '../google/google.module.js';
import { DiscoverController } from './discover.controller.js';
import { DiscoverService } from './discover.service.js';

@Module({
  imports: [AiModule, GoogleModule],
  controllers: [DiscoverController],
  providers: [DiscoverService],
})
export class DiscoverModule {}
