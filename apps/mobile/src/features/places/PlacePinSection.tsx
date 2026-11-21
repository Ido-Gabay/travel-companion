import type { LatLng, Place } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { googleMapsEnabled, PlacesMap } from '@/components/maps/PlacesMap';
import { AppText, Button, InlineError, Sheet, TextField } from '@/components/ui';
import { PinPicker, PinPickerSheet } from '@/features/pins/PinPicker';
import { useErrorMessage } from '@/lib/use-error-message';
import { spacing } from '@/theme/tokens';
import { tripsWithPlace, useUseOwnPinInTrips } from '@/features/trips/queries';
import { useCreatePlace, useUpdatePlace } from './queries';

/** Directions to the user's own pin in the phone's maps app. */
export function openPin(point: LatLng, name: string): void {
  const query = encodeURIComponent(name);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${point.latitude},${point.longitude}&q=${query}`
      : `geo:${point.latitude},${point.longitude}?q=${point.latitude},${point.longitude}(${query})`;
  void Linking.openURL(url).catch(() => undefined);
}

/** D1 · A custom place's own pin: shown on the map, set, moved or removed by the user. */
export function CustomPinSection({ place }: { place: Place }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdatePlace(place.id);
  const [picking, setPicking] = useState(false);
  const pin = place.latitude != null && place.longitude != null ? { latitude: place.latitude, longitude: place.longitude } : null;

  return (
    <View style={styles.root}>
      {pin && googleMapsEnabled ? (
        <PlacesMap points={[{ id: place.id, ...pin, title: place.name ?? '' }]} height={180} />
      ) : null}
      {pin ? (
        <Button label={t('places.directions')} icon="navigate" onPress={() => openPin(pin, place.name ?? '')} />
      ) : null}
      <View style={styles.row}>
        <Button
          label={pin ? t('pin.move') : t('pin.set')}
          icon="location-outline"
          variant="secondary"
          size="sm"
          block={false}
          onPress={() => setPicking(true)}
        />
        {pin ? (
          <Button
            label={t('pin.remove')}
            variant="ghost"
            size="sm"
            block={false}
            onPress={() => update.mutate({ latitude: null, longitude: null })}
          />
        ) : null}
      </View>
      {update.isError ? <InlineError message={errorMessage(update.error)} /> : null}
      <PinPickerSheet
        visible={picking}
        title={pin ? t('pin.move') : t('pin.set')}
        subtitle={place.name ?? undefined}
        initial={pin}
        onPick={(point) => {
          update.mutate(point);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/**
 * D1 Q2 "Use my own pin" for a Google place: a NEW custom place the user names
 * and places themselves (never starting from Google's pin), linked to the Google
 * place by ID only. The Google place itself is not changed.
 */
export function OwnPinSheet({ place, visible, onClose }: { place: Place; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreatePlace();
  const useInTrips = useUseOwnPinInTrips();
  const queryClient = useQueryClient();
  const [name, setName] = useState(place.myLabel ?? '');

  /** The new place is ready: offer to use it in the trips where the Google place is planned. */
  const finish = (ownPlaceId: string) => {
    const open = () => router.push({ pathname: '/places/[id]', params: { id: ownPlaceId } });
    const upcoming = tripsWithPlace(queryClient, place.id).reduce((sum, trip) => sum + trip.upcoming, 0);
    onClose();
    if (upcoming === 0) return open();
    Alert.alert(t('pin.useInTripsTitle'), t('pin.useInTripsBody', { count: upcoming }), [
      { text: t('pin.notNow'), style: 'cancel', onPress: open },
      {
        text: t('pin.useInTrips'),
        onPress: () =>
          useInTrips.mutate(
            { googlePlaceId: place.id, ownPlaceId },
            { onSettled: open, onError: (error) => Alert.alert(errorMessage(error)) },
          ),
      },
    ]);
  };
  const [nameError, setNameError] = useState<string | null>(null);

  return (
    <Sheet visible={visible} title={t('pin.ownTitle')} subtitle={t('pin.ownSubtitle')} onClose={onClose} scroll={false}>
      <TextField
        label={t('pin.name')}
        placeholder={t('pin.namePlaceholder')}
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (nameError) setNameError(null);
        }}
        error={nameError}
        maxLength={120}
      />
      {create.isError ? <InlineError message={errorMessage(create.error)} /> : null}
      <AppText variant="caption" color="secondary">
        {t('pin.ownNote')}
      </AppText>
      {visible ? (
        <PinPicker
          initial={null}
          confirmLabel={t('pin.createOwn')}
          onPick={(point) => {
            if (!name.trim()) return setNameError(t('pin.nameRequired'));
            create.mutate(
              {
                name: name.trim(),
                category: place.category,
                ...point,
                ...(place.googlePlaceId ? { linkedGooglePlaceId: place.googlePlaceId } : {}),
              },
              {
                onSuccess: (created) => finish(created.id),
              },
            );
          }}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
