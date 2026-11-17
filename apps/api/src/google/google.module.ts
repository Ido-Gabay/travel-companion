import { Module } from '@nestjs/common';
import { GoogleController, GooglePhotosController } from './google.controller.js';
import { GooglePlacesService } from './google-places.service.js';

@Module({
  controllers: [GoogleController, GooglePhotosController],
  providers: [GooglePlacesService],
  exports: [GooglePlacesService],
})
export class GoogleModule {}
