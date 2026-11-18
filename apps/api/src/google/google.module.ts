import { Module } from '@nestjs/common';
import { GoogleController, GooglePhotosController, GoogleRoutesController } from './google.controller.js';
import { GoogleRoutesService } from './google-routes.service.js';
import { GooglePlacesService } from './google-places.service.js';

@Module({
  controllers: [GoogleController, GooglePhotosController, GoogleRoutesController],
  providers: [GooglePlacesService, GoogleRoutesService],
  exports: [GooglePlacesService],
})
export class GoogleModule {}
