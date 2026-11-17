import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { MeModule } from './me/me.module.js';
import { PlacesModule } from './places/places.module.js';
import { TripsModule } from './trips/trips.module.js';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, MeModule, TripsModule, PlacesModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
