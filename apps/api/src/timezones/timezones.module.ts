import { Module } from '@nestjs/common';
import { TimeZonesController } from './timezones.controller.js';
import { TimeZonesService } from './timezones.service.js';

@Module({
  controllers: [TimeZonesController],
  providers: [TimeZonesService],
  exports: [TimeZonesService],
})
export class TimeZonesModule {}
