import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
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
import { colors, radii, spacing } from '@/theme/tokens';

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

      <Pressable
        accessibilityRole="search"
        accessibilityLabel={t('home.discoverPrompt')}
        onPress={() => router.navigate('/discover')}
        style={({ pressed }) => [styles.discover, pressed && styles.discoverPressed]}
      >
        <Icon name="sparkles" size={22} color={colors.textOnAccent} />
        <View style={styles.discoverText}>
          <AppText variant="heading" color="onAccent">
            {t('home.discoverPrompt')}
          </AppText>
          <AppText variant="caption" style={styles.discoverHint}>
            {t('home.discoverHint')}
          </AppText>
        </View>
        <Icon name="arrow-forward" size={20} color={colors.textOnAccent} flipInRtl />
      </Pressable>

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
  discover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.accent,
  },
  discoverPressed: { backgroundColor: colors.accentPressed },
  discoverText: { flex: 1, gap: spacing.xxs },
  discoverHint: { color: colors.accentSoft },
});
