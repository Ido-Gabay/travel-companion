import type { Place } from '@travel-companion/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PlacesMap } from '@/components/maps/PlacesMap';
import { AppText } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { PlaceCard } from './PlaceCard';
import { useGooglePlaces } from './queries';

interface CollectionMapProps<P extends Place> {
  places: readonly P[];
  onOpen: (place: P) => void;
}

/** Saved Google places on a Google map; tap a marker to see the place. Custom places have no coordinates. */
export function CollectionMap<P extends Place>({ places, onOpen }: CollectionMapProps<P>) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const googleIds = useMemo(
    () => places.flatMap((place) => (place.googlePlaceId ? [place.googlePlaceId] : [])),
    [places],
  );
  const details = useGooglePlaces(googleIds);

  const points = places.flatMap((place) => {
    const google = place.googlePlaceId ? details.get(place.googlePlaceId) : undefined;
    return google?.location
      ? [{ id: place.id, latitude: google.location.latitude, longitude: google.location.longitude, title: google.name }]
      : [];
  });
  const selected = places.find((place) => place.id === selectedId) ?? null;
  const customCount = places.filter((place) => place.source === 'custom').length;

  return (
    <View style={styles.map}>
      <PlacesMap points={points} selectedId={selectedId} onSelect={setSelectedId} height={420} />
      {selected ? (
        <PlaceCard standalone place={selected} onPress={() => onOpen(selected)} />
      ) : (
        <AppText variant="caption" color="secondary" align="center">
          {t('discover.tapMarker')}
        </AppText>
      )}
      {customCount > 0 ? (
        <AppText variant="caption" color="tertiary" align="center">
          {t('places.customNotOnMap', { count: customCount })}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { gap: spacing.md },
});
