import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DiscoverModule } from './discover/discover.module.js';
import { GoogleModule } from './google/google.module.js';
import { HealthController } from './health/health.controller.js';
import { MeModule } from './me/me.module.js';
import { PlacesModule } from './places/places.module.js';
import { RateLimitGuard } from './rate-limit/rate-limit.guard.js';
import { TimeZonesModule } from './timezones/timezones.module.js';
import { TripsModule } from './trips/trips.module.js';
import { UsageModule } from './usage/usage.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UsageModule,
    AuthModule,
    MeModule,
    TripsModule,
    PlacesModule,
    GoogleModule,
    DiscoverModule,
    AssistantModule,
    TimeZonesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate first, then count the request against the user.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
