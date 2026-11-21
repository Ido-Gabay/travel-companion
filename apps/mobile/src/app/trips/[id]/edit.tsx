import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, NavHeader } from '@/components/ui';
import { useTrip, useUpdateTripV2 } from '@/features/trips/queries';
import { TripForm, type TripFormValues } from '@/features/trips/TripForm';
import { ApiClientError } from '@/lib/api-error';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function EditTripScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const updateTrip = useUpdateTripV2(id);

  /**
   * D1 Q5: new dates that leave visits outside are never applied silently. Planned
   * ones: ask, then remove them. Ones that already happened: they stay; say so.
   */
  const save = (values: TripFormValues, unscheduleOutside = false) => {
    const { title, destination, startDate, endDate } = values;
    updateTrip.mutate(
      { title, destination, startDate, endDate, ...(unscheduleOutside ? { unscheduleOutside: true } : {}) },
      {
        onSuccess: () => router.back(),
        onError: (error) => {
          if (!(error instanceof ApiClientError) || error.code !== 'STOPS_OUTSIDE_DATES') return;
          const happened = error.details.filter((detail) => !detail.message.endsWith(' planned')).length;
          if (happened > 0) {
            Alert.alert(t('editTrip.outsideTitle'), t('editTrip.outsideHappened', { count: happened }));
            return;
          }
          Alert.alert(t('editTrip.outsideTitle'), t('editTrip.outsidePlanned', { count: error.details.length }), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('editTrip.removeAndSave'), style: 'destructive', onPress: () => save(values, true) },
          ]);
        },
      },
    );
  };

  const outside = updateTrip.error instanceof ApiClientError && updateTrip.error.code === 'STOPS_OUTSIDE_DATES';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('editTrip.title')} mode="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {trip.isPending ? (
          <LoadingState />
        ) : trip.isError ? (
          <ScrollView contentContainerStyle={styles.content}>
            <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />
          </ScrollView>
        ) : (
          <TripForm
            initial={{
              title: trip.data.title,
              destination: trip.data.destination,
              baseLocation: trip.data.baseLocation,
              startDate: trip.data.startDate,
              endDate: trip.data.endDate,
            }}
            showBaseLocation={false}
            submitLabel={t('placeForm.saveChanges')}
            submitting={updateTrip.isPending}
            error={updateTrip.isError && !outside ? errorMessage(updateTrip.error) : null}
            onSubmit={(values) => save(values)}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.md },
});
