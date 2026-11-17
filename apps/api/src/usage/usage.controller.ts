import { Controller, Get } from '@nestjs/common';
import type { UsageReport } from '@travel-companion/shared';
import { UsageGuardService } from './usage-guard.service.js';

/**
 * Cost monitoring: how much of each paid API this server used today and this
 * month, against its caps and Google's free allowance. Totals only (no user data).
 */
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageGuardService) {}

  @Get()
  report(): Promise<UsageReport> {
    return this.usage.report();
  }
}
