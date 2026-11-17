import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  ErrorState,
  ListGroup,
  LoadingState,
  Screen,
  ScreenHeader,
  Section,
} from '@/components/ui';
import { useMe } from '@/features/me/queries';
import { OfflineStatus } from '@/features/offline/OfflineStatus';
import { useTrips } from '@/features/trips/queries';
import { tripMode } from '@/features/trips/itinerary';
import { TripCard } from '@/features/trips/TripCard';
import { TripModeCard } from '@/features/trips/TripModeCard';
import { pastTrips, upcomingTrips } from '@/features/trips/upcoming';
import { toIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Home = the active trip (if any) + all your trips. One primary action lives in the
 * trip card; creating a trip is a quiet action on the list.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const trips = useTrips();

  const today = toIsoDate(new Date());
  const items = useMemo(() => trips.data?.items ?? [], [trips.data]);
  const mode = useMemo(() => tripMode(items, today), [items, today]);
  // The focused trip is already on the card above; don't list it twice.
  const upcoming = useMemo(
    () => upcomingTrips(items, today).filter((trip) => trip.id !== mode?.trip.id),
    [items, today, mode],
  );
  const past = useMemo(() => pastTrips(items, today), [items, today]);
  const name = me.data?.displayName;
  const openNewTrip = () => router.push('/trips/new');

  const newTripAction = (
    <Button label={t('trips.newTrip')} icon="add" variant="ghost" size="sm" block={false} onPress={openNewTrip} />
  );

  return (
    <Screen
      refreshing={trips.isRefetching || me.isRefetching}
      onRefresh={() => {
        void trips.refetch();
        void me.refetch();
      }}
    >
      <ScreenHeader title={name ? t('home.greeting', { name }) : t('home.greetingNoName')} />

      {/* M12a: show the saved copy whenever there is one, even if refreshing failed. */}
      {!trips.data ? (
        trips.isPending ? (
          <LoadingState />
        ) : (
          <ErrorState message={errorMessage(trips.error)} onRetry={() => void trips.refetch()} />
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon="airplane-outline"
          title={t('home.emptyTitle')}
          body={t('home.emptyBody')}
          action={<Button label={t('home.createTrip')} icon="add" onPress={openNewTrip} />}
        />
      ) : (
        <>
          <OfflineStatus savedAt={trips.dataUpdatedAt} stale={trips.isError} />
          {mode ? <TripModeCard mode={mode} today={today} /> : null}

          <Section title={mode ? t('home.otherTrips') : t('home.yourTrips')} action={newTripAction}>
            {upcoming.length > 0 ? (
              <ListGroup>
                {upcoming.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </ListGroup>
            ) : (
              <EmptyState icon="map-outline" title={t('home.noOtherTitle')} body={t('home.noOtherBody')} />
            )}
          </Section>

          {past.length > 0 ? (
            <ListGroup title={t('home.past')}>
              {past.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </ListGroup>
          ) : null}
        </>
      )}
    </Screen>
  );
}
