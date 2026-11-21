import { Module } from '@nestjs/common';
import { TimeZonesModule } from '../timezones/timezones.module.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';

@Module({
  imports: [TimeZonesModule],
  controllers: [PlacesController],
  providers: [PlacesService],
})
export class PlacesModule {}
