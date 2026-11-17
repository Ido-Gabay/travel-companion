import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  ScreenHeader,
  Section,
} from '@/components/ui';
import { useMe } from '@/features/me/queries';
import { useTrips } from '@/features/trips/queries';
import { TripCard } from '@/features/trips/TripCard';
import { upcomingTrips } from '@/features/trips/upcoming';
import { toIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const trips = useTrips();

  const upcoming = useMemo(
    () => upcomingTrips(trips.data?.items ?? [], toIsoDate(new Date())),
    [trips.data],
  );
  const name = me.data?.displayName;

  return (
    <Screen
      refreshing={trips.isRefetching || me.isRefetching}
      onRefresh={() => {
        void trips.refetch();
        void me.refetch();
      }}
    >
      <ScreenHeader
        title={name ? t('home.greeting', { name }) : t('home.greetingNoName')}
        subtitle={t('home.subtitle')}
      />

      <Card>
        <View style={styles.plan}>
          <AppText variant="heading">{t('home.planTitle')}</AppText>
          <AppText variant="body" color="secondary">
            {t('home.planBody')}
          </AppText>
          <Button label={t('home.createTrip')} icon="add" onPress={() => router.push('/trips/new')} />
        </View>
      </Card>

      <Section title={t('home.upcoming')}>
        {trips.isPending ? (
          <LoadingState />
        ) : trips.isError ? (
          <ErrorState message={errorMessage(trips.error)} onRetry={() => void trips.refetch()} />
        ) : upcoming.length === 0 ? (
          <EmptyState icon="airplane-outline" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        ) : (
          upcoming.map((trip) => <TripCard key={trip.id} trip={trip} />)
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plan: { gap: spacing.md },
});
