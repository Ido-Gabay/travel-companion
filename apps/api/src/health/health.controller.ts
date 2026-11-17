import { Controller, Get, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ApiException } from '../common/api-exception.js';
import { DatabaseService } from '../database/database.service.js';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly db: DatabaseService) {}

  /** Liveness: the process is up. */
  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: the process can reach the database. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      await this.db.ping();
    } catch (error) {
      // postgres.js error messages never include the password.
      this.logger.error(`Database check failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'Database is unreachable.');
    }
    return { status: 'ok', database: 'ok' };
  }
}
