import { Global, Module } from '@nestjs/common';
import { UsageGuardService } from './usage-guard.service.js';

@Global()
@Module({
  providers: [UsageGuardService],
  exports: [UsageGuardService],
})
export class UsageModule {}
