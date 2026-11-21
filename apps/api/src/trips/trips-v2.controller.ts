import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  STOP_TRANSITIONS,
  addStopSchema,
  addTripMemberSchema,
  calendarDateSchema,
  createStaySchema,
  reorderStopsSchema,
  stopTransitionSchema,
  updateStaySchema,
  updateStopSchema,
  updateTripV2Schema,
  type AddStopData,
  type AddTripMemberInput,
  type CreateStayData,
  type ReorderStopsInput,
  type StayWriteResponse,
  type StopTransition,
  type StopTransitionData,
  type StopWriteResponse,
  type TripDetailV2,
  type TripV2,
  type UpdateStayData,
  type UpdateStopData,
  type UpdateTripV2Data,
} from '@travel-companion/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StaysService } from './stays.service.js';
import { StopsService } from './stops.service.js';
import { TripsV2Service } from './trips-v2.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });
/** Accepts any UUID (offline clients may generate other versions). */
const anyUuid = new ParseUUIDPipe();
const flag = new ZodValidationPipe(z.enum(['1', 'true']).optional().transform((value) => value !== undefined));
const transition = new ZodValidationPipe(z.enum(STOP_TRANSITIONS));

/** D1 · API v2 trip routes (/v2/trips/...). v1 keeps working beside them. */
@Controller({ path: 'trips', version: '2' })
export class TripsV2Controller {
  constructor(
    private readonly trips: TripsV2Service,
    private readonly stops: StopsService,
    private readonly stays: StaysService,
  ) {}

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<TripDetailV2> {
    return this.trips.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateTripV2Schema)) body: UpdateTripV2Data,
  ): Promise<TripV2> {
    return this.trips.update(user, id, body);
  }

  /** ?deleteHistory=1 also removes the trip's completed visits from place history (D1 Q4). */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Query('deleteHistory', flag) deleteHistory: boolean,
  ): Promise<void> {
    return this.trips.remove(user, id, deleteHistory);
  }

  @Post(':id/places')
  @HttpCode(200)
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(addTripMemberSchema)) body: AddTripMemberInput,
  ): Promise<TripDetailV2> {
    return this.trips.addMember(user, id, body);
  }

  @Delete(':id/places/:tripPlaceId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('tripPlaceId', anyUuid) tripPlaceId: string,
  ): Promise<TripDetailV2> {
    return this.trips.removeMember(user, id, tripPlaceId);
  }

  @Post(':id/stops')
  addStop(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(addStopSchema)) body: AddStopData,
  ): Promise<StopWriteResponse> {
    return this.stops.add(user, id, body);
  }

  @Patch(':id/stops/:stopId')
  updateStop(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('stopId', anyUuid) stopId: string,
    @Body(new ZodValidationPipe(updateStopSchema)) body: UpdateStopData,
  ): Promise<StopWriteResponse> {
    return this.stops.update(user, id, stopId, body);
  }

  /** arrive · complete · skip · reset */
  @Post(':id/stops/:stopId/:action')
  @HttpCode(200)
  transition(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('stopId', anyUuid) stopId: string,
    @Param('action', transition) action: StopTransition,
    @Body(new ZodValidationPipe(stopTransitionSchema)) body: StopTransitionData,
  ): Promise<StopWriteResponse> {
    return this.stops.transition(user, id, stopId, action, body);
  }

  /** Removing a completed visit needs ?confirm=1 (it leaves the place history). */
  @Delete(':id/stops/:stopId')
  removeStop(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('stopId', anyUuid) stopId: string,
    @Query('confirm', flag) confirm: boolean,
  ): Promise<TripDetailV2> {
    return this.stops.remove(user, id, stopId, confirm);
  }

  @Put(':id/days/:day/order')
  reorderDay(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('day', new ZodValidationPipe(calendarDateSchema)) day: string,
    @Body(new ZodValidationPipe(reorderStopsSchema)) body: ReorderStopsInput,
  ): Promise<TripDetailV2> {
    return this.stops.reorder(user, id, day, body.stopIds);
  }

  @Post(':id/stays')
  addStay(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(createStaySchema)) body: CreateStayData,
  ): Promise<StayWriteResponse> {
    return this.stays.create(user, id, body);
  }

  @Patch(':id/stays/:stayId')
  updateStay(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('stayId', anyUuid) stayId: string,
    @Body(new ZodValidationPipe(updateStaySchema)) body: UpdateStayData,
  ): Promise<StayWriteResponse> {
    return this.stays.update(user, id, stayId, body);
  }

  @Delete(':id/stays/:stayId')
  removeStay(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('stayId', anyUuid) stayId: string,
  ): Promise<TripDetailV2> {
    return this.stays.remove(user, id, stayId);
  }
}
