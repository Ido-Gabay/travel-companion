import type { Place, PlaceCategory } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListGroup,
  LoadingState,
  Screen,
  ScreenHeader,
  useActionMenu,
} from '@/components/ui';
import { CategoryChips } from '@/features/places/CategoryChips';
import { groupByCategory } from '@/features/places/categories';
import { CollectionMap } from '@/features/places/CollectionMap';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaces } from '@/features/places/queries';
import { useTrip, useTrips } from '@/features/trips/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, compactHitSlop, radii, spacing } from '@/theme/tokens';

type Filter = PlaceCategory | 'all';

const openPlace = (place: Place) => router.push({ pathname: '/places/[id]', params: { id: place.id } });

/** The global collection: everything the user saved, by category, as a list or on a map. */
export default function PlacesScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const places = usePlaces();
  const openMenu = useActionMenu();
  const openDiscover = () => router.navigate('/discover');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  // Saved stays the whole collection; a trip only narrows what's shown to the places saved to it.
  const trips = useTrips();
  const [tripId, setTripId] = useState<string | null>(null);
  const scope = useTrip(tripId ?? '');
  const tripList = trips.data?.items ?? [];
  const scopedTrip = tripId ? tripList.find((trip) => trip.id === tripId) : undefined;
  const inScope = tripId ? new Set(scope.data?.saved.map((place) => place.id) ?? []) : null;

  const items = (places.data?.items ?? []).filter((place) => !inScope || inScope.has(place.id));
  // D1 (A2): hotels are kept under their own Stays filter, apart from the main collection.
  const saved = items.filter((place) => place.category !== 'stay');
  const stays = items.filter((place) => place.category === 'stay');
  const filtered = filter === 'all' ? saved : items.filter((place) => place.category === filter);
  const groups = groupByCategory(saved);
  const chipOptions = [
    { value: 'all' as Filter, count: saved.length },
    ...groups.map((group) => ({ value: group.category as Filter, count: group.items.length })),
    ...(stays.length > 0 ? [{ value: 'stay' as Filter, count: stays.length }] : []),
  ];

  return (
    <Screen refreshing={places.isRefetching} onRefresh={() => void places.refetch()}>
      <ScreenHeader
        title={t('places.title')}
        action={
          <IconButton
            icon="add"
            accessibilityLabel={t('places.newPlace')}
            onPress={() =>
              openMenu({
                title: t('places.newPlace'),
                items: [
                  { label: t('tripDetail.searchPlaces'), icon: 'search', onPress: openDiscover },
                  { label: t('places.newCustom'), icon: 'create-outline', onPress: () => router.push('/places/new') },
                ],
              })
            }
          />
        }
      />

      {places.isPending ? (
        <LoadingState />
      ) : places.isError ? (
        <ErrorState message={errorMessage(places.error)} onRetry={() => void places.refetch()} />
      ) : (places.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title={t('places.emptyTitle')}
          body={t('places.emptyBody')}
          action={<Button label={t('places.discover')} icon="search" onPress={openDiscover} />}
        />
      ) : (
        <>
          {tripList.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('places.tripFilterA11y', { name: scopedTrip?.title ?? t('places.allTrips') })}
              onPress={() =>
                openMenu({
                  title: t('places.showPlaces'),
                  items: [
                    { label: t('places.allTrips'), icon: 'bookmark-outline', onPress: () => setTripId(null) },
                    ...tripList.map((trip) => ({
                      label: trip.title,
                      icon: 'airplane-outline' as const,
                      onPress: () => {
                        setTripId(trip.id);
                        setFilter('all');
                      },
                    })),
                  ],
                })
              }
              hitSlop={compactHitSlop}
              style={({ pressed }) => [styles.scope, tripId !== null && styles.scopeOn, pressed && styles.pressed]}
            >
              <Icon name={tripId ? 'airplane' : 'bookmark-outline'} size={16} color={tripId ? colors.textOnAccent : colors.accent} />
              <AppText variant="label" color={tripId ? 'onAccent' : 'accent'} numberOfLines={1} style={styles.scopeText}>
                {scopedTrip?.title ?? t('places.allTrips')}
              </AppText>
              <Icon name="chevron-down" size={14} color={tripId ? colors.textOnAccent : colors.accent} />
            </Pressable>
          ) : null}
          {tripId && scope.isPending ? (
            <LoadingState />
          ) : tripId && scope.isError ? (
            <ErrorState message={errorMessage(scope.error)} onRetry={() => void scope.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon="airplane-outline" title={t('places.tripEmptyTitle')} body={t('places.tripEmptyBody')} />
          ) : (
            <>
          <View style={styles.filters}>
            <View style={styles.flex}>
              <CategoryChips options={chipOptions} value={filter} onChange={setFilter} />
            </View>
            <IconButton
              icon={view === 'list' ? 'map-outline' : 'list-outline'}
              accessibilityLabel={view === 'list' ? t('discover.map') : t('discover.list')}
              onPress={() => setView(view === 'list' ? 'map' : 'list')}
            />
          </View>
          {view === 'map' ? (
            <CollectionMap places={filtered} onOpen={openPlace} />
          ) : filter === 'all' ? (
            groups.map((group) => (
              <ListGroup key={group.category} title={t(`categories.${group.category}`)}>
                {group.items.map((place) => (
                  <PlaceCard key={place.id} place={place} onPress={() => openPlace(place)} />
                ))}
              </ListGroup>
            ))
          ) : (
            <ListGroup>
              {filtered.map((place) => (
                <PlaceCard key={place.id} place={place} onPress={() => openPlace(place)} />
              ))}
            </ListGroup>
          )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  scope: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  scopeOn: { backgroundColor: colors.accent },
  scopeText: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
