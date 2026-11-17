import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  discoverSearchRequestSchema,
  interpretRequestSchema,
  type DiscoverSearchRequest,
  type DiscoverSearchResponse,
  type InterpretResponse,
} from '@travel-companion/shared';
import type { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DiscoverService } from './discover.service.js';

@Controller('discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  /** Step 1: understand the request (or ask one clarification question). */
  @Post('interpret')
  @HttpCode(200)
  interpret(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(interpretRequestSchema)) body: z.output<typeof interpretRequestSchema>,
  ): Promise<InterpretResponse> {
    return this.discover.interpret(user, body);
  }

  /** Step 2: run the validated plan against Google Places. */
  @Post('search')
  @HttpCode(200)
  search(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(discoverSearchRequestSchema)) body: DiscoverSearchRequest,
  ): Promise<DiscoverSearchResponse> {
    return this.discover.search(user, body);
  }
}
