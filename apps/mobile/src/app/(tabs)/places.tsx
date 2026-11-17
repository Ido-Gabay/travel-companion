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
  LoadingState,
  Screen,
  ScreenHeader,
  Section,
  SegmentedControl,
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
        subtitle={t('places.subtitle')}
        action={
          <View style={styles.actions}>
            <IconButton
              icon="create-outline"
              accessibilityLabel={t('places.newCustom')}
              onPress={() => router.push('/places/new')}
            />
            <IconButton
              icon="sparkles"
              variant="filled"
              accessibilityLabel={t('places.discover')}
              onPress={() => router.navigate('/discover')}
            />
          </View>
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
          action={<Button label={t('places.discover')} icon="sparkles" onPress={() => router.navigate('/discover')} />}
        />
      ) : (
        <>
          <CategoryChips options={chipOptions} value={filter} onChange={setFilter} />
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
            <CollectionMap places={filtered} onOpen={openPlace} />
          ) : filter === 'all' ? (
            groups.map((group) => (
              <Section key={group.category} title={t(`categories.${group.category}`)}>
                {group.items.map((place) => (
                  <PlaceCard key={place.id} place={place} onPress={() => openPlace(place)} />
                ))}
              </Section>
            ))
          ) : (
            filtered.map((place) => <PlaceCard key={place.id} place={place} onPress={() => openPlace(place)} />)
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.xs },
});
