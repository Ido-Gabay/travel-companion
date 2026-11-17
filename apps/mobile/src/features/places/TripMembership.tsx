import type { TripDetail } from '@travel-companion/shared';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon, InlineError } from '@/components/ui';
import { tripKey, useTrips } from '@/features/trips/queries';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';

/** Which of the user's trips this place is in; tap to add or remove. */
export function TripMembership({ placeId }: { placeId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const trips = useTrips();
  const tripItems = trips.data?.items ?? [];
  const details = useQueries({
    queries: tripItems.map((trip) => ({ queryKey: tripKey(trip.id), queryFn: () => api.getTrip(trip.id) })),
  });

  const toggle = useMutation({
    mutationFn: ({ tripId, add }: { tripId: string; add: boolean }) =>
      add ? api.addTripPlace(tripId, placeId) : api.removeTripPlace(tripId, placeId),
    onSuccess: (detail: TripDetail) => {
      queryClient.setQueryData(tripKey(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: ['trips', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['places'] });
    },
  });

  if (tripItems.length === 0) {
    return (
      <AppText variant="caption" color="secondary">
        {t('places.noTripsYet')}
      </AppText>
    );
  }

  return (
    <View style={styles.list}>
      {tripItems.map((trip, index) => {
        const detail = details[index]?.data;
        const inTrip = detail?.places.some((place) => place.id === placeId) ?? false;
        const busy = toggle.isPending && toggle.variables?.tripId === trip.id;
        return (
          <Pressable
            key={trip.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: inTrip, busy, disabled: !detail || toggle.isPending }}
            disabled={!detail || toggle.isPending}
            onPress={() => toggle.mutate({ tripId: trip.id, add: !inTrip })}
            style={[styles.row, inTrip && styles.rowOn]}
          >
            <Icon name="airplane-outline" size={18} color={colors.accent} flipInRtl />
            <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
              {trip.title}
            </AppText>
            {busy || !detail ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon
                name={inTrip ? 'checkmark-circle' : 'add-circle-outline'}
                size={24}
                color={inTrip ? colors.accent : colors.textTertiary}
              />
            )}
          </Pressable>
        );
      })}
      {toggle.isError ? <InlineError message={errorMessage(toggle.error)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  flex: { flex: 1 },
});
