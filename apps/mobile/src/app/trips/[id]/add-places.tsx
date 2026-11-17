import type { Place } from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  InlineError,
  LoadingState,
  NavHeader,
} from '@/components/ui';
import { usePlaces } from '@/features/places/queries';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useAddTripPlace, useRemoveTripPlace, useTrip } from '@/features/trips/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';

/** Pick places from the collection for one trip. Each tap saves immediately. */
export default function AddPlacesScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const places = usePlaces();
  const addPlace = useAddTripPlace(id);
  const removePlace = useRemoveTripPlace(id);

  const inTrip = useMemo(
    () => new Set(trip.data?.places.map((place) => place.id) ?? []),
    [trip.data],
  );
  const busyId = addPlace.isPending
    ? addPlace.variables
    : removePlace.isPending
      ? removePlace.variables
      : null;
  const mutationError = addPlace.error ?? removePlace.error;

  const openNewPlace = () => router.push({ pathname: '/trips/[id]/discover', params: { id } });

  const loading = trip.isPending || places.isPending;
  const failed = trip.isError ? trip.error : places.isError ? places.error : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('addPlaces.title')} mode="close" />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <LoadingState />
        ) : failed ? (
          <ErrorState
            message={errorMessage(failed)}
            onRetry={() => {
              void trip.refetch();
              void places.refetch();
            }}
          />
        ) : (places.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon="bookmark-outline"
            title={t('addPlaces.emptyTitle')}
            body={t('addPlaces.emptyBody')}
            action={<Button label={t('addPlaces.newPlace')} icon="add" onPress={openNewPlace} />}
          />
        ) : (
          <>
            <AppText variant="body" color="secondary">
              {t('addPlaces.body')}
            </AppText>
            {mutationError ? <InlineError message={errorMessage(mutationError)} /> : null}
            <View style={styles.list}>
              {places.data?.items.map((place) => (
                <PickRow
                  key={place.id}
                  place={place}
                  selected={inTrip.has(place.id)}
                  busy={busyId === place.id}
                  disabled={busyId !== null}
                  onPress={() => (inTrip.has(place.id) ? removePlace.mutate(place.id) : addPlace.mutate(place.id))}
                />
              ))}
            </View>
            <Button label={t('addPlaces.newPlace')} icon="add" variant="secondary" onPress={openNewPlace} />
            <Button label={t('common.done')} onPress={() => router.back()} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PickRow({
  place,
  selected,
  busy,
  disabled,
  onPress,
}: {
  place: Place;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const display = usePlaceDisplay(place);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, busy, disabled }}
      accessibilityLabel={display.name}
      accessibilityHint={selected ? t('addPlaces.added') : t('addPlaces.notAdded')}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, (pressed || busy) && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {display.name}
        </AppText>
        {display.address ? (
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {display.address}
          </AppText>
        ) : null}
      </View>
      <Icon
        name={selected ? 'checkmark-circle' : 'add-circle-outline'}
        size={26}
        color={selected ? colors.accent : colors.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: spacing.xxs },
});
