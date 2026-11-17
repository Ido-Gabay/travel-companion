import type { TripPlace } from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  InlineError,
  LoadingState,
  NavHeader,
  Section,
} from '@/components/ui';
import { openInMaps } from '@/features/places/open-in-maps';
import { useDeleteTrip, useRemoveTripPlace, useTrip } from '@/features/trips/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function TripScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const removePlace = useRemoveTripPlace(id);
  const deleteTrip = useDeleteTrip();

  const openAddPlaces = () =>
    router.push({ pathname: '/trips/[id]/add-places', params: { id } });

  const confirmDelete = () => {
    Alert.alert(t('tripDetail.deleteTripTitle'), t('tripDetail.deleteTripBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteTrip.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <NavHeader />
      <ScrollView contentContainerStyle={styles.content}>
        {trip.isPending ? (
          <LoadingState />
        ) : trip.isError ? (
          <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />
        ) : (
          <>
            <View style={styles.hero}>
              <AppText variant="display" accessibilityRole="header">
                {trip.data.title}
              </AppText>
              {trip.data.destination ? (
                <View style={styles.meta}>
                  <Icon name="location-outline" size={16} color={colors.textSecondary} />
                  <AppText variant="body" color="secondary">
                    {trip.data.destination}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.meta}>
                <Icon name="calendar-outline" size={16} color={colors.textSecondary} />
                <AppText variant="body" color="secondary">
                  {formatTripDates(trip.data.startDate, trip.data.endDate, locale) ?? t('trips.noDates')}
                </AppText>
              </View>
            </View>

            <Section title={t('tripDetail.places')}>
              {trip.data.places.length === 0 ? (
                <EmptyState
                  icon="bookmark-outline"
                  title={t('tripDetail.emptyTitle')}
                  body={t('tripDetail.emptyBody')}
                  action={<Button label={t('tripDetail.addPlaces')} icon="add" onPress={openAddPlaces} />}
                />
              ) : (
                <>
                  {trip.data.places.map((place) => (
                    <TripPlaceCard
                      key={place.placeId}
                      place={place}
                      removing={removePlace.isPending && removePlace.variables === place.placeId}
                      onRemove={() => removePlace.mutate(place.placeId)}
                    />
                  ))}
                  {removePlace.isError ? <InlineError message={errorMessage(removePlace.error)} /> : null}
                  <Button label={t('tripDetail.addPlaces')} icon="add" variant="secondary" onPress={openAddPlaces} />
                </>
              )}
            </Section>

            <View style={styles.danger}>
              {deleteTrip.isError ? <InlineError message={errorMessage(deleteTrip.error)} /> : null}
              <Button
                label={t('tripDetail.deleteTrip')}
                icon="trash-outline"
                variant="danger"
                loading={deleteTrip.isPending}
                onPress={confirmDelete}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TripPlaceCard({
  place,
  removing,
  onRemove,
}: {
  place: TripPlace;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      onPress={() => router.push({ pathname: '/places/[id]', params: { id: place.placeId } })}
      accessibilityLabel={place.name}
      style={removing ? styles.removing : undefined}
    >
      <View style={styles.placeRow}>
        <View style={styles.placeText}>
          <AppText variant="heading">{place.name}</AppText>
          {place.address ? (
            <AppText variant="caption" color="secondary">
              {place.address}
            </AppText>
          ) : null}
          {place.notes ? (
            <AppText variant="body" color="secondary" style={styles.notes}>
              {place.notes}
            </AppText>
          ) : null}
        </View>
        <View style={styles.actions}>
          <IconButton
            icon="navigate-outline"
            accessibilityLabel={t('tripDetail.openInMaps')}
            onPress={() => openInMaps(place.name, place.address)}
          />
          <IconButton
            icon="remove-circle-outline"
            accessibilityLabel={t('tripDetail.removeFromTrip', { name: place.name })}
            onPress={onRemove}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xxl },
  hero: { gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  placeText: { flex: 1, gap: spacing.xxs },
  notes: { marginTop: spacing.xs },
  actions: { gap: spacing.xs },
  removing: { opacity: 0.4 },
  danger: { marginTop: spacing.lg },
});
