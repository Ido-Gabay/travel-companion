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
  updatePlaceSchema,
  type CreatePlaceData,
  type Place,
  type PlaceList,
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

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<Place> {
    return this.places.get(user, id);
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
