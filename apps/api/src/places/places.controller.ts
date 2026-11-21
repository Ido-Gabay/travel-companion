import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createPlaceSchema,
  linkGooglePlaceSchema,
  saveGooglePlacesSchema,
  type LinkGooglePlaceInput,
  updatePlaceSchema,
  type CreatePlaceData,
  type Place,
  type PlaceList,
  type PlaceVisitList,
  type SaveGooglePlacesInput,
  type UpdatePlaceData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlacesService } from './places.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PlaceList> {
    return this.places.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPlaceSchema)) body: CreatePlaceData,
  ): Promise<Place> {
    return this.places.create(user, body);
  }

  /** Save Google places (by place ID) to the collection, optionally into a trip. */
  @Post('google')
  saveGoogle(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(saveGooglePlacesSchema)) body: SaveGooglePlacesInput,
  ): Promise<{ places: Place[] }> {
    return this.places.saveGoogle(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<Place> {
    return this.places.get(user, id);
  }

  /** D1: the place's visit history. */
  @Get(':id/visits')
  visits(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<PlaceVisitList> {
    return this.places.visits(user, id);
  }

  /** Link the user's own place to the Google place they picked (same id, or the one already saved). */
  @Post(':id/google')
  @HttpCode(200)
  linkGoogle(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(linkGooglePlaceSchema)) body: LinkGooglePlaceInput,
  ): Promise<Place> {
    return this.places.linkGoogle(user, id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updatePlaceSchema)) body: UpdatePlaceData,
  ): Promise<Place> {
    return this.places.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<void> {
    return this.places.remove(user, id);
  }
}
