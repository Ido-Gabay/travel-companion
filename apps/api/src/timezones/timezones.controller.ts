import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { timeZoneLookupSchema, type TimeZoneLookupInput, type TimeZoneSuggestion } from '@travel-companion/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TimeZonesService } from './timezones.service.js';

@Controller('timezones')
export class TimeZonesController {
  constructor(private readonly timeZones: TimeZonesService) {}

  /** A zone suggestion for a point, for the user to confirm. Nothing is stored or logged. */
  @Post('lookup')
  @HttpCode(200)
  lookup(@Body(new ZodValidationPipe(timeZoneLookupSchema)) body: TimeZoneLookupInput): TimeZoneSuggestion {
    return this.timeZones.suggest(body.latitude, body.longitude);
  }
}
