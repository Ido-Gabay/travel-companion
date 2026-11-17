import { Injectable } from '@nestjs/common';
import type {
  Me,
  Preferences,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from '@travel-companion/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { notFound } from '../common/api-exception.js';
import { DatabaseService, type Tx } from '../database/database.service.js';
import { toMe, toPreferences, type MeRow, type PreferencesRow } from './me.mapper.js';

@Injectable()
export class MeService {
  constructor(private readonly db: DatabaseService) {}

  getMe(user: AuthUser): Promise<Me> {
    return this.db.asUser(user, async (tx) => {
      await ensureProfile(tx, user.id);
      return selectMe(tx, user);
    });
  }

  updateProfile(user: AuthUser, input: UpdateProfileInput): Promise<Me> {
    return this.db.asUser(user, async (tx) => {
      await ensureProfile(tx, user.id);
      await tx`
        update app.profiles
        set display_name = ${input.displayName}
        where id = ${user.id} and deleted_at is null
      `;
      return selectMe(tx, user);
    });
  }

  getPreferences(user: AuthUser): Promise<Preferences> {
    return this.db.asUser(user, async (tx) => {
      await ensureProfile(tx, user.id);
      const [row] = await tx<PreferencesRow[]>`
        select locale, distance_unit, updated_at, version
        from app.user_preferences
        where user_id = ${user.id}
      `;
      if (!row) throw notFound('Preferences not found.');
      return toPreferences(row);
    });
  }

  updatePreferences(user: AuthUser, input: UpdatePreferencesInput): Promise<Preferences> {
    return this.db.asUser(user, async (tx) => {
      await ensureProfile(tx, user.id);
      const [row] = await tx<PreferencesRow[]>`
        update app.user_preferences
        set
          locale = coalesce(${input.locale ?? null}::text, locale),
          distance_unit = coalesce(${input.distanceUnit ?? null}::text, distance_unit)
        where user_id = ${user.id}
        returning locale, distance_unit, updated_at, version
      `;
      if (!row) throw notFound('Preferences not found.');
      return toPreferences(row);
    });
  }
}

/**
 * Profiles are created by a database trigger at sign-up. This is a cheap
 * safety net for users created before the trigger existed or if it failed.
 */
async function ensureProfile(tx: Tx, userId: string): Promise<void> {
  await tx`insert into app.profiles (id) values (${userId}) on conflict (id) do nothing`;
  await tx`
    insert into app.user_preferences (user_id) values (${userId})
    on conflict (user_id) do nothing
  `;
}

async function selectMe(tx: Tx, user: AuthUser): Promise<Me> {
  const [row] = await tx<MeRow[]>`
    select
      p.id, p.display_name, p.created_at, p.updated_at, p.version,
      up.locale, up.distance_unit,
      up.updated_at as preferences_updated_at,
      up.version as preferences_version
    from app.profiles p
    join app.user_preferences up on up.user_id = p.id
    where p.id = ${user.id} and p.deleted_at is null
  `;
  if (!row) throw notFound('Profile not found.');
  return toMe(row, user.email);
}
