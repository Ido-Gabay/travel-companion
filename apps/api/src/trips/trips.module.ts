import { Module } from '@nestjs/common';
import { TimeZonesModule } from '../timezones/timezones.module.js';
import { StaysService } from './stays.service.js';
import { StopsService } from './stops.service.js';
import { TripsV2Controller } from './trips-v2.controller.js';
import { TripsV2Service } from './trips-v2.service.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

@Module({
  imports: [TimeZonesModule],
  controllers: [TripsController, TripsV2Controller],
  providers: [TripsService, TripsV2Service, StopsService, StaysService],
})
export class TripsModule {}
