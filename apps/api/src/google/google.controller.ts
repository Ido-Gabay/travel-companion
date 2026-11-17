import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  DEFAULT_LOCALE,
  googlePlaceIdSchema,
  localeSchema,
  type GooglePlace,
} from '@travel-companion/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GooglePlacesService } from './google-places.service.js';

/**
 * Fresh Google details for one place, for display only. Any signed-in user
 * may look up any place ID (Google content isn't user data).
 */
@Controller('google/places')
export class GoogleController {
  constructor(private readonly google: GooglePlacesService) {}

  @Get(':placeId')
  get(
    @Param('placeId', new ZodValidationPipe(googlePlaceIdSchema)) placeId: string,
    @Query('lang', new ZodValidationPipe(localeSchema.optional())) lang?: 'en' | 'he',
  ): Promise<GooglePlace> {
    return this.google.getPlace(placeId, lang ?? DEFAULT_LOCALE);
  }
}
