import type { Place, PlaceCategory } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  ErrorState,
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
import { useErrorMessage } from '@/lib/use-error-message';
import { spacing } from '@/theme/tokens';

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

  const items = places.data?.items ?? [];
  const filtered = filter === 'all' ? items : items.filter((place) => place.category === filter);
  const groups = groupByCategory(items);
  const chipOptions = [
    { value: 'all' as Filter, count: items.length },
    ...groups.map((group) => ({ value: group.category as Filter, count: group.items.length })),
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
      ) : items.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title={t('places.emptyTitle')}
          body={t('places.emptyBody')}
          action={<Button label={t('places.discover')} icon="search" onPress={openDiscover} />}
        />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
