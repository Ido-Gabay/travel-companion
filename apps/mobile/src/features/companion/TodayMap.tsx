import type { LatLng } from '@travel-companion/shared';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { googleMapsEnabled } from '@/components/maps/PlacesMap';
import { quietMapStyle } from '@/theme/map-style';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { markerLabel } from '@/features/trips/map-markers';
import type { MapPin, TodayMapModel } from './today-map';

export interface TodayMapHandle {
  /** Frame the whole day above the sheet. */
  fitDay: () => void;
  /** Center on one point (a selected stop, or the user's location). */
  focus: (point: LatLng) => void;
}

interface TodayMapProps {
  model: TodayMapModel;
  hotel: LatLng | null;
  /** The last one-shot location reading, if any. Never tracked continuously. */
  here: { coords: LatLng; stale: boolean; minutes: number } | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Space covered by floating UI: the top bar and the sheet. */
  padding: { top: number; bottom: number };
}

/** Pin sizes: the next stop is the one thing that stands out. */
const PIN = { done: 22, later: 26, next: 36, now: 36 } as const;

/**
 * The map-first Today map. Google map (PROVIDER_GOOGLE, required for Google
 * places content) with a quiet style and our own pins:
 * done = small grey check, next = large accent, now = green "you're here",
 * later = white with its number. The next leg is the real route (solid) when
 * Google Routes answered (M16), else a dashed straight line; the rest of the day
 * is always straight and dotted. Navigation opens in the maps app (Directions).
 */
export const TodayMap = forwardRef<TodayMapHandle, TodayMapProps>(function TodayMap(
  { model, hotel, here, selectedId, onSelect, padding },
  ref,
) {
  const { t } = useTranslation();
  const map = useRef<MapView>(null);
  const frameRef = useRef(model.frame);
  frameRef.current = model.frame;

  const fitDay = () => {
    const frame = frameRef.current;
    if (frame.length === 0) return;
    if (frame.length === 1 && frame[0]) {
      map.current?.animateCamera?.({ center: frame[0], zoom: 15 }, { duration: 350 });
      return;
    }
    map.current?.fitToCoordinates?.(frame, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  };
  useImperativeHandle(ref, () => ({
    fitDay,
    focus: (point) => map.current?.animateCamera?.({ center: point }, { duration: 350 }),
  }));

  // Frame the day when its stops change (a new day, a stop added); not on every render.
  const frameKey = model.frame.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|');
  useEffect(() => {
    const timer = setTimeout(fitDay, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  if (!googleMapsEnabled) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.placeholder, { paddingTop: padding.top, paddingBottom: padding.bottom }]}>
        <Icon name="map-outline" size={26} color={colors.textTertiary} />
        <AppText variant="caption" color="secondary" align="center">
          {t('map.notConfigured')}
        </AppText>
      </View>
    );
  }

  const start = model.frame[0] ?? hotel ?? { latitude: 40.758, longitude: -73.9855 };
  const pinLabel = (pin: MapPin) =>
    [
      pin.kind === 'done'
        ? t('today.pinDone', { number: pin.number, name: pin.name })
        : pin.kind === 'next'
          ? t('today.pinNext', { number: pin.number, name: pin.name })
          : pin.kind === 'now'
            ? t('today.pinNow', { number: pin.number, name: pin.name })
            : t('today.pinLater', { number: pin.number, name: pin.name }),
      pin.also.length > 0 ? t('today.pinAlso', { numbers: pin.also.join(', ') }) : null,
    ]
      .filter(Boolean)
      .join('. ');

  return (
    <MapView
      ref={map}
      testID="today-map"
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      customMapStyle={quietMapStyle}
      initialRegion={{ ...start, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      // Keeps Google's logo and our pins clear of the top bar and the sheet.
      mapPadding={{ top: padding.top, right: 0, bottom: padding.bottom, left: 0 }}
      onPress={() => onSelect(null)}
      toolbarEnabled={false}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      accessibilityLabel={t('today.mapLabel', { count: model.pins.length })}
    >
      {model.laterPath.length > 1 ? (
        <Polyline coordinates={model.laterPath} strokeColor={colors.borderStrong} strokeWidth={2} lineDashPattern={[2, 6]} />
      ) : null}
      {model.nextLeg ? (
        <Polyline
          coordinates={model.nextLeg}
          strokeColor={colors.accent}
          strokeWidth={4}
          // A real route (Google, M16) is solid; a straight line stays dashed.
          lineDashPattern={model.nextLegIsRoute ? undefined : [10, 7]}
          zIndex={2}
        />
      ) : null}

      {hotel ? (
        <Marker coordinate={hotel} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={1} title={t('today.hotel')}>
          <View style={styles.hotel} accessible accessibilityLabel={t('today.hotel')}>
            <Icon name="bed-outline" size={15} color={colors.textSecondary} />
          </View>
        </Marker>
      ) : null}

      {model.pins.map((pin, index) => {
        const selected = pin.id === selectedId;
        const size = PIN[pin.kind];
        const text = pin.also.length > 0 ? markerLabel([pin.number, ...pin.also].sort((a, b) => a - b)) : String(pin.number);
        return (
          <Marker
            // Remount on state change so the custom view redraws (tracksViewChanges is off for performance).
            key={`${pin.id}:${pin.kind}:${text}:${selected ? 1 : 0}`}
            identifier={pin.id}
            coordinate={pin.location}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            // By kind, then day order (earlier on top), so overlap never depends on mount order.
            zIndex={(pin.kind === 'next' || pin.kind === 'now' ? 10 : selected ? 9 : pin.kind === 'later' ? 5 : 3) * 1000 - index}
            onPress={(event) => {
              event.stopPropagation?.();
              onSelect(pin.id);
            }}
          >
            <View
              testID={`pin-${pin.id}`}
              accessible
              accessibilityRole="button"
              accessibilityLabel={pinLabel(pin)}
              accessibilityState={{ selected }}
              style={[
                styles.pin,
                pin.also.length > 0 ? { minWidth: size, height: size, paddingHorizontal: spacing.xs } : { width: size, height: size },
                pin.kind === 'done' && styles.pinDone,
                pin.kind === 'later' && styles.pinLater,
                pin.kind === 'next' && styles.pinNext,
                pin.kind === 'now' && styles.pinNow,
                selected && styles.pinSelected,
              ]}
            >
              {pin.kind === 'done' ? (
                <Icon name="checkmark" size={13} color={colors.textTertiary} />
              ) : pin.kind === 'now' ? (
                <Icon name="location" size={18} color={colors.textOnAccent} />
              ) : (
                <AppText
                  variant={pin.kind === 'next' ? 'bodyStrong' : 'caption'}
                  style={pin.kind === 'next' ? styles.numberNext : styles.numberLater}
                  allowFontScaling={false}
                >
                  {text}
                </AppText>
              )}
            </View>
          </Marker>
        );
      })}

      {here ? (
        <Marker
          key={`here:${here.stale ? 1 : 0}`}
          coordinate={here.coords}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={20}
          title={here.stale ? t('today.lastKnown', { min: here.minutes }) : t('today.youAreHere')}
        >
          <View
            testID="here-dot"
            accessible
            accessibilityLabel={here.stale ? t('today.lastKnown', { min: here.minutes }) : t('today.youAreHere')}
            style={[styles.here, here.stale && styles.hereStale]}
          />
        </Marker>
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  pin: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  pinDone: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  pinLater: { backgroundColor: colors.surface, borderColor: colors.accent },
  pinNext: { backgroundColor: colors.accent, borderColor: colors.surface, borderWidth: 3, ...shadows.floating },
  pinNow: { backgroundColor: colors.success, borderColor: colors.surface, borderWidth: 3, ...shadows.floating },
  pinSelected: { borderColor: colors.text },
  numberNext: { color: colors.textOnAccent, fontWeight: '700' },
  numberLater: { color: colors.accent, fontWeight: '700' },
  hotel: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  here: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.location,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  /** Stale: hollow and grey, so it never reads as a live position. */
  hereStale: { backgroundColor: colors.surface, borderColor: colors.textTertiary, borderWidth: 2 },
});
