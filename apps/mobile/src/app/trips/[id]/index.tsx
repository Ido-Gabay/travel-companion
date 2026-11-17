import { googleMapsDirectionsUrl, type TripPlace } from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { colors, radii, spacing } from '@/theme/tokens';

export default function TripScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const removePlace = useRemoveTripPlace(id);
  const deleteTrip = useDeleteTrip();

  const [view, setView] = useState<'list' | 'map'>('list');
  const [hideVisited, setHideVisited] = useState(false);
  const allPlaces = trip.data?.places ?? [];
  const visitedCount = allPlaces.filter((place) => place.visitedAt !== null).length;
  const shownPlaces = hideVisited ? allPlaces.filter((place) => place.visitedAt === null) : allPlaces;
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
      <NavHeader
        action={
          trip.data ? (
            <IconButton
              icon="create-outline"
              accessibilityLabel={t('editTrip.title')}
              onPress={() => router.push({ pathname: '/trips/[id]/edit', params: { id } })}
            />
          ) : undefined
        }
      />
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
              {trip.data.baseLocation ? (
                <View style={styles.meta}>
                  <Icon name="bed-outline" size={16} color={colors.textSecondary} />
                  <AppText variant="body" color="secondary">
                    {t('tripDetail.stayingAt', { place: trip.data.baseLocation })}
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
                  <View style={styles.progressRow}>
                    <View style={styles.progressText}>
                      <AppText variant="caption" color="secondary">
                        {t('tripDetail.visitedProgress', { visited: visitedCount, total: allPlaces.length })}
                      </AppText>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.round((visitedCount / Math.max(allPlaces.length, 1)) * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                    {visitedCount > 0 ? (
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{ checked: hideVisited }}
                        onPress={() => setHideVisited((value) => !value)}
                        style={[styles.hideToggle, hideVisited && styles.hideToggleOn]}
                      >
                        <Icon
                          name={hideVisited ? 'eye-off-outline' : 'eye-outline'}
                          size={14}
                          color={hideVisited ? colors.textOnAccent : colors.textSecondary}
                        />
                        <AppText variant="caption" style={[styles.hideText, hideVisited && styles.hideTextOn]}>
                          {t('tripDetail.hideVisited')}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
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
                      places={shownPlaces}
                      onOpen={(place) => router.push({ pathname: '/places/[id]', params: { id: place.id } })}
                    />
                  ) : (
                    groupByCategory(shownPlaces).map((group) => (
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
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressText: { flex: 1, gap: spacing.xs },
  progressTrack: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  hideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hideToggleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  hideText: { fontWeight: '600', color: colors.textSecondary },
  hideTextOn: { color: colors.textOnAccent },
});
