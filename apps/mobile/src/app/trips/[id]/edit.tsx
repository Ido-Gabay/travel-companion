import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, NavHeader } from '@/components/ui';
import { useTrip, useUpdateTrip } from '@/features/trips/queries';
import { TripForm } from '@/features/trips/TripForm';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function EditTripScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const updateTrip = useUpdateTrip(id);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('editTrip.title')} mode="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {trip.isPending ? (
            <LoadingState />
          ) : trip.isError ? (
            <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />
          ) : (
            <TripForm
              initial={{
                title: trip.data.title,
                destination: trip.data.destination,
                baseLocation: trip.data.baseLocation,
                startDate: trip.data.startDate,
                endDate: trip.data.endDate,
              }}
              submitLabel={t('placeForm.saveChanges')}
              submitting={updateTrip.isPending}
              error={updateTrip.isError ? errorMessage(updateTrip.error) : null}
              onSubmit={(values) => updateTrip.mutate(values, { onSuccess: () => router.back() })}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.md },
});
