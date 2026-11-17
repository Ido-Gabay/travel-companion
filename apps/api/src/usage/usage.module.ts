import { Global, Module } from '@nestjs/common';
import { UsageGuardService } from './usage-guard.service.js';
import { UsageController } from './usage.controller.js';

@Global()
@Module({
  controllers: [UsageController],
  providers: [UsageGuardService],
  exports: [UsageGuardService],
})
export class UsageModule {}
