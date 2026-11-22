import { googleMapsDirectionsUrl, tripDays } from '@travel-companion/shared';
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
import { GoogleLinkSheet, useStayPin } from '@/features/places/GoogleLinkSheet';
import { useLinkGooglePlace } from '@/features/places/queries';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { DayPickerSheet } from '@/features/trips/DayPickerSheet';
import { countByDay, dayShort, formatStartTime } from '@/features/trips/itinerary';
import { isUpcoming, type SavedPlace, type TripItem } from '@/features/trips/model';
import { StaysSection } from '@/features/trips/StaysSection';
import { ItineraryView } from '@/features/trips/ItineraryView';
import { useDeleteTrip, usePlanVisit, useRemoveTripPlace, useTrip } from '@/features/trips/queries';
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
  const stayPin = useStayPin(trip.data);
  const removePlace = useRemoveTripPlace(id);
  const deleteTrip = useDeleteTrip();
  const planVisit = usePlanVisit(id);

  const [view, setView] = useState<'plan' | 'places' | 'map'>('plan');
  const [planning, setPlanning] = useState<{ place: SavedPlace; name: string } | null>(null);
  const [linking, setLinking] = useState<{ place: SavedPlace; name: string } | null>(null);
  const link = useLinkGooglePlace();
  const days = useMemo(
    () => tripDays(trip.data?.startDate ?? null, trip.data?.endDate ?? null),
    [trip.data?.startDate, trip.data?.endDate],
  );
  const counts = useMemo(() => countByDay(trip.data?.places ?? []), [trip.data?.places]);
  const [hideVisited, setHideVisited] = useState(false);
  // D1: the Places tab lists the places SAVED to the trip (each once), however often they're visited.
  const allPlaces = trip.data?.saved ?? [];
  const doneOnce = (place: SavedPlace) => place.visits.some((visit) => visit.status === 'completed');
  const visitedCount = allPlaces.filter(doneOnce).length;
  const shownPlaces = hideVisited ? allPlaces.filter((place) => !doneOnce(place)) : allPlaces;
  const openAddPlaces = () =>
    router.push({ pathname: '/trips/[id]/add-places', params: { id } });
  const openDiscover = () => router.push({ pathname: '/trips/[id]/discover', params: { id } });
  const openEdit = () => router.push({ pathname: '/trips/[id]/edit', params: { id } });
  const openPlace = (place: { id: string }) => router.push({ pathname: '/places/[id]', params: { id: place.id } });
  const openItem = (item: TripItem) => router.push({ pathname: '/places/[id]', params: { id: item.placeId } });
  /** Next planned visit ("Tue 24 · 09:30"), else Done, plus how many visits when more than one. */
  const planBadge = (place: SavedPlace) => {
    const next = place.visits.find((visit) => isUpcoming(visit.status));
    const when = next
      ? [dayShort(next.day, locale), next.startTime ? formatStartTime(next.startTime, locale) : null].filter(Boolean).join(' · ')
      : doneOnce(place)
        ? t('visits.done')
        : null;
    const count = place.visits.filter((visit) => visit.status !== 'skipped').length;
    return [when, count > 1 ? t('visits.count', { count }) : null].filter(Boolean).join(' · ') || null;
  };

  const openAddMenu = () =>
    openMenu({
      title: t('tripDetail.addPlaces'),
      items: [
        { label: t('tripDetail.searchPlaces'), icon: 'search', onPress: openDiscover },
        { label: t('tripDetail.fromSaved'), icon: 'bookmark-outline', onPress: openAddPlaces },
        {
          label: t('tripDetail.importList'),
          icon: 'document-text-outline',
          onPress: () => router.push({ pathname: '/trips/[id]/import', params: { id } }),
        },
      ],
    });

  /** D1 Q4: done visits stay in each place's history, unless the user also deletes that history. */
  const confirmDelete = () => {
    const done = trip.data?.places.some((item) => item.status === 'completed') ?? false;
    const run = (deleteHistory: boolean) => deleteTrip.mutate({ id, deleteHistory }, { onSuccess: () => router.back() });
    Alert.alert(t('tripDetail.deleteTripTitle'), done ? t('tripDetail.deleteTripBodyHistory') : t('tripDetail.deleteTripBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => run(false) },
      ...(done ? [{ text: t('tripDetail.deleteWithHistory'), style: 'destructive' as const, onPress: () => run(true) }] : []),
    ]);
  };

  /** Removing a saved place takes its planned visits; done ones stay in the place's history. */
  const confirmRemovePlace = (place: SavedPlace) => {
    const done = place.visits.some((visit) => visit.status === 'completed');
    if (!done) {
      removePlace.mutate(place.id);
      return;
    }
    Alert.alert(t('visits.removePlaceTitle'), t('visits.removePlaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('tripDetail.removeShort'), style: 'destructive', onPress: () => removePlace.mutate(place.id) },
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
                      label: t('journal.recap'),
                      icon: 'book-outline',
                      onPress: () => router.push({ pathname: '/trips/[id]/recap', params: { id } }),
                    },
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
              <StaysSection trip={trip.data} />
            </View>

            <OfflineStatus savedAt={trip.dataUpdatedAt} stale={trip.isError} />

            <Button label={t('tripDetail.addPlaces')} icon="add" variant="secondary" onPress={openAddMenu} />

            <SegmentedControl
              accessibilityLabel={t('discover.view')}
              options={[
                { value: 'plan', label: t('itinerary.plan') },
                { value: 'places', label: `${t('itinerary.places')} · ${trip.data.saved.length}` },
                { value: 'map', label: t('discover.map') },
              ]}
              value={view}
              onChange={setView}
            />

            {view === 'plan' ? (
              <ItineraryView
                trip={trip.data}
                onOpenPlace={openItem}
                onDiscover={openDiscover}
                onEditTrip={openEdit}
              />
            ) : trip.data.saved.length === 0 ? (
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
                          onLink={(name) => setLinking({ place, name })}
                          onRemove={() => confirmRemovePlace(place)}
                        />
                      ))}
                    </ListGroup>
                  ))
                )}
                {removePlace.isError ? <InlineError message={errorMessage(removePlace.error)} /> : null}
                {planVisit.isError ? <InlineError message={errorMessage(planVisit.error)} /> : null}
              </View>
            )}

            {linking ? (
              <GoogleLinkSheet
                visible
                name={linking.name}
                query={[linking.place.name, linking.place.address].filter(Boolean).join(' ') || linking.name}
                near={trip.data.destination}
                stay={stayPin}
                category={linking.place.category}
                busy={link.isPending}
                error={link.isError ? errorMessage(link.error) : null}
                onPick={(result) =>
                  link.mutate(
                    { placeId: linking.place.id, googlePlaceId: result.placeId, primaryType: result.primaryType },
                    { onSuccess: () => setLinking(null) },
                  )
                }
                onClose={() => setLinking(null)}
              />
            ) : null}

            <DayPickerSheet
              visible={planning !== null}
              title={planning && planning.place.visits.length > 0 ? t('visits.againTitle') : undefined}
              placeName={planning?.name ?? ''}
              days={days}
              current={null}
              counts={counts}
              allowWishlist={false}
              onPick={(day) => {
                if (planning && day) planVisit.mutate({ tripPlaceId: planning.place.tripPlaceId, day });
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
  onLink,
  onRemove,
}: {
  place: SavedPlace;
  badge: string | null;
  canPlan: boolean;
  removing: boolean;
  onPlan: (name: string) => void;
  onLink: (name: string) => void;
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
                  {
                    label: place.visits.length > 0 ? t('visits.again') : t('itinerary.pickDay'),
                    icon: place.visits.length > 0 ? 'repeat-outline' : 'calendar-outline',
                    onPress: () => onPlan(display.name),
                    hidden: !canPlan,
                  },
                  { label: t('places.directions'), icon: 'navigate-outline', onPress: navigate },
                  {
                    label: t('googleLink.action'),
                    icon: 'location-outline',
                    onPress: () => onLink(display.name),
                    hidden: place.source !== 'custom' || place.latitude != null || Boolean(place.linkedGooglePlaceId),
                  },
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
  placeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  placeText: { flex: 1, gap: spacing.xxs },
  notes: { marginTop: spacing.xs },
  actions: { gap: spacing.xs },
  removing: { opacity: 0.4 },
  danger: { marginTop: spacing.lg },
  discoverRow: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  group: { gap: spacing.md },
  placesBody: { gap: spacing.lg },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs },
  toggleText: { fontWeight: '600' },
});
