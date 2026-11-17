import { router } from 'expo-router';
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
} from '@/components/ui';
import { useTrips } from '@/features/trips/queries';
import { TripCard } from '@/features/trips/TripCard';
import { useErrorMessage } from '@/lib/use-error-message';

export default function TripsScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const trips = useTrips();
  const openNewTrip = () => router.push('/trips/new');

  return (
    <Screen refreshing={trips.isRefetching} onRefresh={() => void trips.refetch()}>
      <ScreenHeader
        title={t('trips.title')}
        action={
          <IconButton
            icon="add"
            variant="filled"
            accessibilityLabel={t('trips.newTrip')}
            onPress={openNewTrip}
          />
        }
      />

      {!trips.data ? (
        trips.isPending ? (
          <LoadingState />
        ) : (
          <ErrorState message={errorMessage(trips.error)} onRetry={() => void trips.refetch()} />
        )
      ) : trips.data.items.length === 0 ? (
        <EmptyState
          icon="map-outline"
          title={t('trips.emptyTitle')}
          body={t('trips.emptyBody')}
          action={<Button label={t('home.createTrip')} icon="add" onPress={openNewTrip} />}
        />
      ) : (
        <ListGroup>
          {trips.data.items.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
