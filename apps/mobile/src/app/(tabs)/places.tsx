import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaces } from '@/features/places/queries';
import { useErrorMessage } from '@/lib/use-error-message';

/** The global collection: every place the user saved, newest first. */
export default function PlacesScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const places = usePlaces();
  const openNew = () => router.push('/places/new');

  return (
    <Screen refreshing={places.isRefetching} onRefresh={() => void places.refetch()}>
      <ScreenHeader
        title={t('places.title')}
        subtitle={t('places.subtitle')}
        action={
          <IconButton icon="add" variant="filled" accessibilityLabel={t('places.newPlace')} onPress={openNew} />
        }
      />

      {places.isPending ? (
        <LoadingState />
      ) : places.isError ? (
        <ErrorState message={errorMessage(places.error)} onRetry={() => void places.refetch()} />
      ) : places.data.items.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title={t('places.emptyTitle')}
          body={t('places.emptyBody')}
          action={<Button label={t('places.newPlace')} icon="add" onPress={openNew} />}
        />
      ) : (
        places.data.items.map((place) => (
          <PlaceCard
            key={place.id}
            place={place}
            onPress={() => router.push({ pathname: '/places/[id]', params: { id: place.id } })}
          />
        ))
      )}
    </Screen>
  );
}
