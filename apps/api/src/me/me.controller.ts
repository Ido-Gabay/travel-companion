import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  updatePreferencesSchema,
  updateProfileSchema,
  type Me,
  type Preferences,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MeService } from './me.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.me.getMe(user);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<Me> {
    return this.me.updateProfile(user, body);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser): Promise<Preferences> {
    return this.me.getPreferences(user);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ): Promise<Preferences> {
    return this.me.updatePreferences(user, body);
  }
}
