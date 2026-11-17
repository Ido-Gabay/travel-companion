import Constants from 'expo-constants';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { regionToBounds, type Bounds } from '@/features/companion/geo';
import { AppText, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme/tokens';

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  /** Short text drawn in the marker, e.g. the stop number in a day plan. */
  label?: string;
}

interface PlacesMapProps {
  points: readonly MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number;
  /** Draw a line through the points in order (a day's route, as the crow flies). */
  connect?: boolean;
  /** Called after the user moves or zooms the map by hand (not when it fits the points). */
  onUserMove?: (bounds: Bounds) => void;
  /** Show the blue "you are here" dot (only after location permission was granted). */
  showsUserLocation?: boolean;
}

/** True when the app was built with a Google Maps iOS key (see app.config.ts). */
/** Moves within this long after fitting the points count as the map's own. */
const AUTO_MOVE_SETTLE_MS = 1500;

export const googleMapsEnabled = Boolean(
  (Constants.expoConfig?.extra as { googleMapsEnabled?: boolean } | undefined)?.googleMapsEnabled,
);

/**
 * A Google map with one marker per point. Google Places content shown on a
 * map must be on a Google map, so this always uses PROVIDER_GOOGLE.
 */
export function PlacesMap({
  points,
  selectedId,
  onSelect,
  height,
  connect = false,
  onUserMove,
  showsUserLocation = false,
}: PlacesMapProps) {
  const { t } = useTranslation();
  const ref = useRef<MapView>(null);
  /** When the map last moved by itself, so that move isn't reported as the user's. */
  const lastAutoMove = useRef(0);
  const coordinates = useMemo(
    () => points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    [points],
  );

  useEffect(() => {
    if (coordinates.length === 0) return;
    lastAutoMove.current = Date.now();
    const timer = setTimeout(() => {
      lastAutoMove.current = Date.now();
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
        showsUserLocation={showsUserLocation}
        onRegionChangeComplete={(region, details) => {
          if (!onUserMove) return;
          const byHand =
            details?.isGesture ?? Date.now() - lastAutoMove.current > AUTO_MOVE_SETTLE_MS;
          if (byHand) onUserMove(regionToBounds(region));
        }}
      >
        {connect && coordinates.length > 1 ? (
          <Polyline
            coordinates={coordinates}
            strokeColor={colors.accent}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        ) : null}
        {points.map((point) => (
          <Marker
            key={`${point.id}:${point.label ?? ''}:${point.id === selectedId ? 1 : 0}`}
            identifier={point.id}
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            title={point.title}
            pinColor={point.label ? undefined : point.id === selectedId ? colors.danger : colors.accent}
            onPress={(event) => {
              event.stopPropagation();
              onSelect?.(point.id);
            }}
          >
            {point.label ? (
              <View style={[styles.numbered, point.id === selectedId && styles.numberedSelected]}>
                <AppText variant="caption" color="onAccent" style={styles.numberedText}>
                  {point.label}
                </AppText>
              </View>
            ) : undefined}
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  numbered: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberedSelected: { backgroundColor: colors.danger },
  numberedText: { fontWeight: '700' },
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
