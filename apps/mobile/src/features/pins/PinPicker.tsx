import type { LatLng } from '@travel-companion/shared';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Icon, Sheet } from '@/components/ui';
import { getCurrentLocation } from '@/features/companion/location';
import { colors, radii, spacing } from '@/theme/tokens';

/** Zoomed in enough to place a pin on a building. */
const CLOSE = { latitudeDelta: 0.01, longitudeDelta: 0.01 };
/** Nothing known yet: the whole world, the user zooms in. */
const WORLD: Region = { latitude: 25, longitude: 10, latitudeDelta: 120, longitudeDelta: 120 };

interface PinPickerProps {
  /** The pin to move (the user's own), if there is one. Never a Google coordinate (D1 Q2). */
  initial: LatLng | null;
  onPick: (point: LatLng) => void;
  confirmLabel?: string;
}

/**
 * The user places their own pin: the map is only the canvas, the point is
 * theirs. It starts from their earlier pin, else where they are now (if they
 * allow it), else the whole world — never from a Google place's location.
 * Uses the system map (no Google content is shown here).
 */
export function PinPicker({ initial, onPick, confirmLabel }: PinPickerProps) {
  const { t } = useTranslation();
  const map = useRef<MapView>(null);
  const [center, setCenter] = useState<LatLng | null>(initial);
  const [locating, setLocating] = useState(false);

  const goToMe = async () => {
    setLocating(true);
    const result = await getCurrentLocation();
    setLocating(false);
    if (result.ok) {
      setCenter(result.coords);
      map.current?.animateToRegion({ ...result.coords, ...CLOSE }, 400);
    }
  };

  useEffect(() => {
    // No pin yet: start where the user is (asks for "while using" permission once).
    if (!initial) void goToMe();
    // Only when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.mapBox}>
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={initial ? { ...initial, ...CLOSE } : WORLD}
          onRegionChangeComplete={(region) => setCenter({ latitude: region.latitude, longitude: region.longitude })}
          accessibilityLabel={t('pin.mapLabel')}
        />
        <View pointerEvents="none" style={styles.crosshair}>
          <Icon name="location" size={40} color={colors.accent} />
        </View>
      </View>
      <AppText variant="caption" color="secondary">
        {t('pin.hint')}
      </AppText>
      <Button label={t('pin.myLocation')} icon="locate-outline" variant="ghost" size="sm" loading={locating} onPress={() => void goToMe()} />
      <Button
        label={confirmLabel ?? t('pin.use')}
        icon="checkmark"
        disabled={!center || (center.latitude === 0 && center.longitude === 0)}
        onPress={() => center && onPick({ latitude: round(center.latitude), longitude: round(center.longitude) })}
      />
    </View>
  );
}

/** ~1 m precision is plenty for a pin. */
const round = (value: number) => Math.round(value * 1e5) / 1e5;

export function PinPickerSheet({
  visible,
  title,
  subtitle,
  initial,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  initial: LatLng | null;
  onPick: (point: LatLng) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} subtitle={subtitle} onClose={onClose} scroll={false}>
      {visible ? <PinPicker initial={initial} onPick={onPick} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.md },
  mapBox: { flex: 1, minHeight: 280, borderRadius: radii.card, overflow: 'hidden', backgroundColor: colors.surface },
  crosshair: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // The pin's tip marks the point.
    paddingBottom: 40,
  },
});
