import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  extractPlacesRequestSchema,
  tripAssistantRequestSchema,
  type ExtractPlacesResponse,
  type TripAssistantResponse,
} from '@travel-companion/shared';
import type { z } from 'zod';
import { AiService } from '../ai/ai.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

/**
 * D1 trip assistant. Stateless: the app sends the request and a compact,
 * Google-free summary of the trip; the answer is planning instructions the
 * app turns into a proposal. Nothing is read or written in the database.
 */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly ai: AiService) { }

  @Post('trip')
  @HttpCode(200)
  trip(
    @Body(new ZodValidationPipe(tripAssistantRequestSchema)) body: z.output<typeof tripAssistantRequestSchema>,
  ): Promise<TripAssistantResponse> {
    return this.ai.tripAssistant(body);
  }

  /** Import: place names from pasted free text. Nothing is looked up or stored here. */
  @Post('extract-places')
  @HttpCode(200)
  extractPlaces(
    @Body(new ZodValidationPipe(extractPlacesRequestSchema)) body: z.output<typeof extractPlacesRequestSchema>,
  ): Promise<ExtractPlacesResponse> {
    return this.ai.extractPlaces(body);
  }
}
