import type { GooglePlace, Place } from '@travel-companion/shared';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useConnection } from '@/features/offline/connection';
import { useGooglePlace } from './queries';

/**
 * The name to show when Google's name can't be loaded (offline, limit reached).
 * Never a stored Google name (not allowed): the user's own label if they set one,
 * else the place's category.
 */
export function fallbackName(place: Pick<Place, 'category'> & { myLabel?: string | null }, t: TFunction): string {
  return place.myLabel ?? t('places.offlineName', { category: t(`categories.${place.category}`) });
}

export interface PlaceDisplay {
  /** Google's current name for Google places; the user's name for custom places. */
  name: string;
  address: string | null;
  typeLabel: string | null;
  google: GooglePlace | null;
  /** Google details are still loading. */
  loading: boolean;
  /** Google details couldn't be loaded (offline, daily limit, removed place). */
  unavailable: boolean;
}

/** Everything a screen needs to show a place, fetching Google details when needed. */
export function usePlaceDisplay(
  place: Pick<Place, 'source' | 'googlePlaceId' | 'name' | 'address' | 'category'> & { myLabel?: string | null },
): PlaceDisplay {
  const { t } = useTranslation();
  const offline = useConnection() === 'offline';
  const google = useGooglePlace(place.source === 'google' ? place.googlePlaceId : null);

  if (place.source === 'custom') {
    return {
      name: place.name ?? '',
      address: place.address,
      typeLabel: null,
      google: null,
      loading: false,
      unavailable: false,
    };
  }
  return {
    name: google.data?.name ?? (google.isPending && !offline ? t('common.loading') : fallbackName(place, t)),
    address: google.data?.address ?? null,
    typeLabel: google.data?.typeLabel ?? null,
    google: google.data ?? null,
    loading: google.isPending && !offline,
    unavailable: google.isError || (offline && !google.data),
  };
}
