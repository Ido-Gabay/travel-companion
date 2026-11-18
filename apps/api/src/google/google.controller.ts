import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  DEFAULT_LOCALE,
  GOOGLE_PHOTO_MAX_WIDTH,
  googlePhotoNameSchema,
  googlePlaceIdSchema,
  localeSchema,
  routeLegsRequestSchema,
  type RouteLegsRequest,
  type RouteLegsResponse,
  type GooglePhotoMedia,
  type GooglePlace,
  type GooglePlacePreview,
} from '@travel-companion/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GooglePlacesService } from './google-places.service.js';
import { GoogleRoutesService } from './google-routes.service.js';

const langPipe = new ZodValidationPipe(localeSchema.optional());
const widthPipe = new ZodValidationPipe(
  z.coerce.number().int().min(100).max(GOOGLE_PHOTO_MAX_WIDTH).optional(),
);

/**
 * Fresh Google content for display only (never stored). Any signed-in user
 * may look up any place ID (Google content isn't user data).
 */
@Controller('google/places')
export class GoogleController {
  constructor(private readonly google: GooglePlacesService) {}

  /** Basic details (name, address, location, type). Place Details Pro. */
  @Get(':placeId')
  get(
    @Param('placeId', new ZodValidationPipe(googlePlaceIdSchema)) placeId: string,
    @Query('lang', langPipe) lang?: 'en' | 'he',
  ): Promise<GooglePlace> {
    return this.google.getPlace(placeId, lang ?? DEFAULT_LOCALE);
  }

  /** Preview: basic details plus rating, opening hours and photo list (capped; falls back to basic). */
  @Get(':placeId/preview')
  preview(
    @Param('placeId', new ZodValidationPipe(googlePlaceIdSchema)) placeId: string,
    @Query('lang', langPipe) lang?: 'en' | 'he',
  ): Promise<GooglePlacePreview> {
    return this.google.getPreview(placeId, lang ?? DEFAULT_LOCALE);
  }
}

@Controller('google/photos')
export class GooglePhotosController {
  constructor(private readonly google: GooglePlacesService) {}

  /** A short-lived image URL for one photo from a preview. Billed per photo (capped). */
  @Get()
  photo(
    @Query('name', new ZodValidationPipe(googlePhotoNameSchema)) name: string,
    @Query('maxWidth', widthPipe) maxWidth?: number,
  ): Promise<GooglePhotoMedia> {
    return this.google.getPhoto(name, maxWidth ?? 800);
  }
}

/**
 * M16: real travel times between points (Routes API, Essentials only). Capped
 * per day and month; legs past a cap come back null and the app uses its own
 * estimate. Nothing is stored.
 */
@Controller('google/routes')
export class GoogleRoutesController {
  constructor(private readonly routes: GoogleRoutesService) {}

  @Post()
  @HttpCode(200)
  legs(
    @Body(new ZodValidationPipe(routeLegsRequestSchema)) body: RouteLegsRequest,
    @Query('lang', langPipe) lang?: 'en' | 'he',
  ): Promise<RouteLegsResponse> {
    return this.routes.computeLegs(body.legs, lang ?? DEFAULT_LOCALE);
  }
}
