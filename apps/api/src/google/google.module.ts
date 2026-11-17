import { Module } from '@nestjs/common';
import { GoogleController } from './google.controller.js';
import { GooglePlacesService } from './google-places.service.js';

@Module({
  controllers: [GoogleController],
  providers: [GooglePlacesService],
  exports: [GooglePlacesService],
})
export class GoogleModule {}
