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
  addTripPlaceSchema,
  createTripSchema,
  updateTripSchema,
  type AddTripPlaceInput,
  type CreateTripData,
  type Trip,
  type TripDetail,
  type TripList,
  type UpdateTripData,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TripsService } from './trips.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<TripList> {
    return this.trips.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTripSchema)) body: CreateTripData,
  ): Promise<Trip> {
    return this.trips.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<TripDetail> {
    return this.trips.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateTripSchema)) body: UpdateTripData,
  ): Promise<Trip> {
    return this.trips.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<void> {
    return this.trips.remove(user, id);
  }

  @Post(':id/places')
  @HttpCode(200)
  addPlace(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(addTripPlaceSchema)) body: AddTripPlaceInput,
  ): Promise<TripDetail> {
    return this.trips.addPlace(user, id, body.placeId);
  }

  @Delete(':id/places/:placeId')
  removePlace(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('placeId', uuid) placeId: string,
  ): Promise<TripDetail> {
    return this.trips.removePlace(user, id, placeId);
  }
}
