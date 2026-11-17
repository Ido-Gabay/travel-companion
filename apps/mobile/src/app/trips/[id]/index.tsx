import { googleMapsDirectionsUrl, tripDays, type TripPlace } from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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
  ListGroup,
  LoadingState,
  NavHeader,
  SegmentedControl,
  useActionMenu,
} from '@/components/ui';
import { groupByCategory } from '@/features/places/categories';
import { CollectionMap } from '@/features/places/CollectionMap';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { DayPickerSheet } from '@/features/trips/DayPickerSheet';
import { HotelPinSheet } from '@/features/trips/HotelPinSheet';
import { countByDay, dayShort, formatStartTime } from '@/features/trips/itinerary';
import { ItineraryView } from '@/features/trips/ItineraryView';
import {
  useDeleteTrip,
  useRemoveTripPlace,
  useScheduleTripPlace,
  useTrip,
} from '@/features/trips/queries';
import { OfflineStatus } from '@/features/offline/OfflineStatus';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function TripScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const openMenu = useActionMenu();
  const trip = useTrip(id);
  const removePlace = useRemoveTripPlace(id);
  const deleteTrip = useDeleteTrip();
  const schedule = useScheduleTripPlace(id);

  const [view, setView] = useState<'plan' | 'places' | 'map'>('plan');
  const [pinOpen, setPinOpen] = useState(false);
  const [planning, setPlanning] = useState<{ place: TripPlace; name: string } | null>(null);
  const days = useMemo(
    () => tripDays(trip.data?.startDate ?? null, trip.data?.endDate ?? null),
    [trip.data?.startDate, trip.data?.endDate],
  );
  const counts = useMemo(() => countByDay(trip.data?.places ?? []), [trip.data?.places]);
  const [hideVisited, setHideVisited] = useState(false);
  const allPlaces = trip.data?.places ?? [];
  const visitedCount = allPlaces.filter((place) => place.visitedAt !== null).length;
  const shownPlaces = hideVisited ? allPlaces.filter((place) => place.visitedAt === null) : allPlaces;
  const openAddPlaces = () =>
    router.push({ pathname: '/trips/[id]/add-places', params: { id } });
  const openDiscover = () => router.push({ pathname: '/trips/[id]/discover', params: { id } });
  const openEdit = () => router.push({ pathname: '/trips/[id]/edit', params: { id } });
  const openPlace = (place: TripPlace) => router.push({ pathname: '/places/[id]', params: { id: place.id } });
  const planBadge = (place: TripPlace) =>
    place.day
      ? [dayShort(place.day, locale), place.startTime ? formatStartTime(place.startTime, locale) : null]
          .filter(Boolean)
          .join(' · ')
      : null;

  const openAddMenu = () =>
    openMenu({
      title: t('tripDetail.addPlaces'),
      items: [
        { label: t('tripDetail.searchPlaces'), icon: 'search', onPress: openDiscover },
        { label: t('tripDetail.fromSaved'), icon: 'bookmark-outline', onPress: openAddPlaces },
      ],
    });

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
              icon="ellipsis-horizontal"
              accessibilityLabel={t('tripDetail.options')}
              onPress={() =>
                openMenu({
                  title: trip.data.title,
                  items: [
                    { label: t('editTrip.title'), icon: 'create-outline', onPress: openEdit },
                    {
                      label: t('hotelPin.title'),
                      icon: 'bed-outline',
                      onPress: () => setPinOpen(true),
                      hidden: !(trip.data.baseLocation || trip.data.basePlaceId),
                    },
                    { label: t('tripDetail.searchPlaces'), icon: 'search', onPress: openDiscover },
                    { label: t('tripDetail.fromSaved'), icon: 'bookmark-outline', onPress: openAddPlaces },
                    { label: t('tripDetail.deleteTrip'), icon: 'trash-outline', destructive: true, onPress: confirmDelete },
                  ],
                })
              }
            />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!trip.data ? (
          trip.isPending ? (
            <LoadingState />
          ) : (
            <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />
          )
        ) : (
          <>
            <View style={styles.hero}>
              <AppText variant="display" accessibilityRole="header">
                {trip.data.title}
              </AppText>
              <AppText variant="body" color="secondary">
                {[
                  trip.data.destination,
                  formatTripDates(trip.data.startDate, trip.data.endDate, locale) ?? t('trips.noDates'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              {trip.data.baseLocation || trip.data.basePlaceId ? (
                <Pressable accessibilityRole="button" onPress={() => setPinOpen(true)} style={styles.meta}>
                  <Icon name="bed-outline" size={16} color={colors.textSecondary} />
                  <AppText variant="caption" color="secondary" style={styles.flexShrink}>
                    {t('tripDetail.stayingAt', { place: trip.data.baseLocation ?? t('hotelPin.pinnedShort') })}
                  </AppText>
                  {trip.data.basePlaceId ? (
                    <Icon name="location" size={16} color={colors.accent} />
                  ) : (
                    <AppText variant="caption" color="accent" style={styles.pinLink}>
                      {t('hotelPin.pinOnMap')}
                    </AppText>
                  )}
                </Pressable>
              ) : null}
            </View>

            <OfflineStatus savedAt={trip.dataUpdatedAt} stale={trip.isError} />

            <Button label={t('tripDetail.addPlaces')} icon="add" variant="secondary" onPress={openAddMenu} />

            <SegmentedControl
              accessibilityLabel={t('discover.view')}
              options={[
                { value: 'plan', label: t('itinerary.plan') },
                { value: 'places', label: `${t('itinerary.places')} · ${trip.data.places.length}` },
                { value: 'map', label: t('discover.map') },
              ]}
              value={view}
              onChange={setView}
            />

            {view === 'plan' ? (
              <ItineraryView
                trip={trip.data}
                onOpenPlace={openPlace}
                onDiscover={openDiscover}
                onEditTrip={openEdit}
              />
            ) : trip.data.places.length === 0 ? (
              <EmptyState
                icon="bookmark-outline"
                title={t('tripDetail.emptyTitle')}
                body={t('tripDetail.emptyBody')}
              />
            ) : (
              <View style={styles.placesBody}>
                <View style={styles.progressRow}>
                  <AppText variant="caption" color="secondary" style={styles.flex}>
                    {t('tripDetail.visitedProgress', { visited: visitedCount, total: allPlaces.length })}
                  </AppText>
                  {visitedCount > 0 ? (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: hideVisited }}
                      hitSlop={8}
                      onPress={() => setHideVisited((value) => !value)}
                    >
                      <AppText variant="caption" color="accent" style={styles.toggleText}>
                        {hideVisited ? t('tripDetail.showVisited') : t('tripDetail.hideVisited')}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
                {view === 'map' ? (
                  <CollectionMap places={shownPlaces} onOpen={openPlace} />
                ) : (
                  groupByCategory(shownPlaces).map((group) => (
                    <ListGroup key={group.category} title={t(`categories.${group.category}`)}>
                      {group.items.map((place) => (
                        <TripPlaceCard
                          key={place.id}
                          place={place}
                          badge={planBadge(place)}
                          canPlan={days.length > 0}
                          removing={removePlace.isPending && removePlace.variables === place.id}
                          onPlan={(name) => setPlanning({ place, name })}
                          onRemove={() => removePlace.mutate(place.id)}
                        />
                      ))}
                    </ListGroup>
                  ))
                )}
                {removePlace.isError ? <InlineError message={errorMessage(removePlace.error)} /> : null}
                {schedule.isError ? <InlineError message={errorMessage(schedule.error)} /> : null}
              </View>
            )}

            <HotelPinSheet trip={trip.data} visible={pinOpen} onClose={() => setPinOpen(false)} />
            <DayPickerSheet
              visible={planning !== null}
              placeName={planning?.name ?? ''}
              days={days}
              current={planning?.place.day ?? null}
              counts={counts}
              onPick={(day) => {
                if (planning && day !== planning.place.day) schedule.mutate({ placeId: planning.place.id, day });
                setPlanning(null);
              }}
              onClose={() => setPlanning(null)}
            />

            {deleteTrip.isError ? <InlineError message={errorMessage(deleteTrip.error)} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TripPlaceCard({
  place,
  badge,
  canPlan,
  removing,
  onPlan,
  onRemove,
}: {
  place: TripPlace;
  badge: string | null;
  canPlan: boolean;
  removing: boolean;
  onPlan: (name: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const openMenu = useActionMenu();
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
        badge={badge}
        onPress={() => router.push({ pathname: '/places/[id]', params: { id: place.id } })}
        actions={
          <IconButton
            icon="ellipsis-horizontal"
            accessibilityLabel={t('itinerary.moreFor', { name: display.name })}
            onPress={() =>
              openMenu({
                title: display.name,
                items: [
                  {
                    label: t('itinerary.openPlace'),
                    icon: 'information-circle-outline',
                    onPress: () => router.push({ pathname: '/places/[id]', params: { id: place.id } }),
                  },
                  { label: t('itinerary.pickDay'), icon: 'calendar-outline', onPress: () => onPlan(display.name), hidden: !canPlan },
                  { label: t('places.directions'), icon: 'navigate-outline', onPress: navigate },
                  { label: t('tripDetail.removeShort'), icon: 'remove-circle-outline', destructive: true, onPress: onRemove },
                ],
              })
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl },
  hero: { gap: spacing.xs },
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
  flexShrink: { flexShrink: 1 },
  pinLink: { fontWeight: '600' },
  placesBody: { gap: spacing.lg },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs },
  toggleText: { fontWeight: '600' },
});
