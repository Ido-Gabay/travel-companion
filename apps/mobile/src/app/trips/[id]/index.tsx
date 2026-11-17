import { googleMapsDirectionsUrl, type TripPlace } from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  InlineError,
  LoadingState,
  NavHeader,
  Section,
  SegmentedControl,
} from '@/components/ui';
import { groupByCategory } from '@/features/places/categories';
import { CollectionMap } from '@/features/places/CollectionMap';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaceDisplay } from '@/features/places/use-place-display';
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

  const [view, setView] = useState<'list' | 'map'>('list');
  const openAddPlaces = () =>
    router.push({ pathname: '/trips/[id]/add-places', params: { id } });
  const openDiscover = () => router.push({ pathname: '/trips/[id]/discover', params: { id } });

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

            <View style={styles.discoverRow}>
              <View style={styles.flex}>
                <Button label={t('tripDetail.discover')} icon="sparkles" onPress={openDiscover} />
              </View>
              <Button label={t('tripDetail.fromCollection')} variant="secondary" icon="bookmark-outline" onPress={openAddPlaces} block={false} />
            </View>

            <Section title={`${t('tripDetail.places')} · ${trip.data.places.length}`}>
              {trip.data.places.length === 0 ? (
                <EmptyState
                  icon="bookmark-outline"
                  title={t('tripDetail.emptyTitle')}
                  body={t('tripDetail.emptyBody')}
                />
              ) : (
                <>
                  <SegmentedControl
                    accessibilityLabel={t('discover.view')}
                    options={[
                      { value: 'list', label: t('discover.list') },
                      { value: 'map', label: t('discover.map') },
                    ]}
                    value={view}
                    onChange={setView}
                  />
                  {view === 'map' ? (
                    <CollectionMap
                      places={trip.data.places}
                      onOpen={(place) => router.push({ pathname: '/places/[id]', params: { id: place.id } })}
                    />
                  ) : (
                    groupByCategory(trip.data.places).map((group) => (
                      <View key={group.category} style={styles.group}>
                        <AppText variant="overline" color="tertiary">
                          {t(`categories.${group.category}`).toUpperCase()}
                        </AppText>
                        {group.items.map((place) => (
                          <TripPlaceCard
                            key={place.id}
                            place={place}
                            removing={removePlace.isPending && removePlace.variables === place.id}
                            onRemove={() => removePlace.mutate(place.id)}
                          />
                        ))}
                      </View>
                    ))
                  )}
                  {removePlace.isError ? <InlineError message={errorMessage(removePlace.error)} /> : null}
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
  const display = usePlaceDisplay(place);
  const navigate = () => {
    if (place.googlePlaceId) {
      void Linking.openURL(googleMapsDirectionsUrl(place.googlePlaceId, display.google?.name ?? display.name)).catch(() => undefined);
    } else {
      openInMaps(place.name ?? '', place.address);
    }
  };
  return (
    <View style={removing ? styles.removing : undefined}>
      <PlaceCard
        place={place}
        onPress={() => router.push({ pathname: '/places/[id]', params: { id: place.id } })}
        actions={
          <View style={styles.actions}>
            <IconButton icon="navigate-outline" accessibilityLabel={t('places.directions')} onPress={navigate} />
            <IconButton
              icon="remove-circle-outline"
              accessibilityLabel={t('tripDetail.removeFromTrip', { name: display.name })}
              onPress={onRemove}
            />
          </View>
        }
      />
    </View>
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
  discoverRow: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  group: { gap: spacing.md },
});
