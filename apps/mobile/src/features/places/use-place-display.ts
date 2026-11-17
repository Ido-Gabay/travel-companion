import type { GooglePlace, Place } from '@travel-companion/shared';
import { useTranslation } from 'react-i18next';
import { useGooglePlace } from './queries';

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
export function usePlaceDisplay(place: Pick<Place, 'source' | 'googlePlaceId' | 'name' | 'address'>): PlaceDisplay {
  const { t } = useTranslation();
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
    name: google.data?.name ?? (google.isPending ? t('common.loading') : t('places.detailsUnavailable')),
    address: google.data?.address ?? null,
    typeLabel: google.data?.typeLabel ?? null,
    google: google.data ?? null,
    loading: google.isPending,
    unavailable: google.isError,
  };
}
