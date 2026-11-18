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
  Put,
} from '@nestjs/common';
import {
  addTripPlaceSchema,
  calendarDateSchema,
  createTripSchema,
  reorderTripDaySchema,
  scheduleTripPlaceSchema,
  updateJournalDaySchema,
  updateTripSchema,
  type AddTripPlaceInput,
  type CreateTripData,
  type ReorderTripDayInput,
  type JournalDay,
  type ScheduleTripPlaceData,
  type Trip,
  type TripJournal,
  type UpdateJournalDayData,
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

  /** Plan a trip place for a day, set its time, or move it back to the wishlist. */
  @Patch(':id/places/:placeId')
  schedulePlace(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('placeId', uuid) placeId: string,
    @Body(new ZodValidationPipe(scheduleTripPlaceSchema)) body: ScheduleTripPlaceData,
  ): Promise<TripDetail> {
    return this.trips.schedulePlace(user, id, placeId, body);
  }

  /** Set the order of one day's places. */
  @Put(':id/days/:day/order')
  reorderDay(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('day', new ZodValidationPipe(calendarDateSchema)) day: string,
    @Body(new ZodValidationPipe(reorderTripDaySchema)) body: ReorderTripDayInput,
  ): Promise<TripDetail> {
    return this.trips.reorderDay(user, id, day, body.placeIds);
  }

  /** M15: the trip journal (days with a note or rating). */
  @Get(':id/journal')
  getJournal(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<TripJournal> {
    return this.trips.getJournal(user, id);
  }

  /** M15: set a day's note and/or rating. */
  @Put(':id/journal/:day')
  updateJournalDay(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('day', new ZodValidationPipe(calendarDateSchema)) day: string,
    @Body(new ZodValidationPipe(updateJournalDaySchema)) body: UpdateJournalDayData,
  ): Promise<JournalDay> {
    return this.trips.updateJournalDay(user, id, day, body);
  }
}
