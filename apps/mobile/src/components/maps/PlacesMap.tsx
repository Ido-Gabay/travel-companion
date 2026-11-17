import Constants from 'expo-constants';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme/tokens';

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
}

interface PlacesMapProps {
  points: readonly MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number;
}

/** True when the app was built with a Google Maps iOS key (see app.config.ts). */
export const googleMapsEnabled = Boolean(
  (Constants.expoConfig?.extra as { googleMapsEnabled?: boolean } | undefined)?.googleMapsEnabled,
);

/**
 * A Google map with one marker per point. Google Places content shown on a
 * map must be on a Google map, so this always uses PROVIDER_GOOGLE.
 */
export function PlacesMap({ points, selectedId, onSelect, height }: PlacesMapProps) {
  const { t } = useTranslation();
  const ref = useRef<MapView>(null);
  const coordinates = useMemo(
    () => points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    [points],
  );

  useEffect(() => {
    if (coordinates.length === 0) return;
    const timer = setTimeout(() => {
      ref.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [coordinates]);

  if (!googleMapsEnabled) {
    return (
      <View style={[styles.placeholder, height ? { height } : styles.fill]}>
        <Icon name="map-outline" size={26} color={colors.textTertiary} />
        <AppText variant="caption" color="secondary" align="center">
          {t('map.notConfigured')}
        </AppText>
      </View>
    );
  }

  const first = points[0];
  return (
    <View style={[styles.frame, height ? { height } : styles.fill]}>
      <MapView
        ref={ref}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={
          first
            ? { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
            : { latitude: 40.758, longitude: -73.9855, latitudeDelta: 0.12, longitudeDelta: 0.12 }
        }
        onPress={() => onSelect?.(null)}
        toolbarEnabled={false}
      >
        {points.map((point) => (
          <Marker
            key={point.id}
            identifier={point.id}
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            title={point.title}
            pinColor={point.id === selectedId ? colors.danger : colors.accent}
            onPress={(event) => {
              event.stopPropagation();
              onSelect?.(point.id);
            }}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  fill: { flex: 1, minHeight: 360 },
  placeholder: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
});
