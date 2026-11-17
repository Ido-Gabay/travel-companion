import type { DistanceUnit, Me, Preferences, SupportedLocale } from '@travel-companion/shared';

export interface PreferencesRow {
  locale: SupportedLocale;
  distance_unit: DistanceUnit;
  updated_at: Date;
  version: number;
}

export interface MeRow {
  id: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  locale: SupportedLocale;
  distance_unit: DistanceUnit;
  preferences_updated_at: Date;
  preferences_version: number;
}

export function toPreferences(row: PreferencesRow): Preferences {
  return {
    locale: row.locale,
    distanceUnit: row.distance_unit,
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toMe(row: MeRow, email: string | null): Me {
  return {
    id: row.id,
    email,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
    preferences: toPreferences({
      locale: row.locale,
      distance_unit: row.distance_unit,
      updated_at: row.preferences_updated_at,
      version: row.preferences_version,
    }),
  };
}
