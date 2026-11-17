import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NavHeader } from '@/components/ui';
import { PlaceForm } from '@/features/places/PlaceForm';
import { useCreatePlace } from '@/features/places/queries';
import { useAddTripPlace } from '@/features/trips/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

/**
 * Save a new place to the collection. Opened with ?tripId=… from a trip, the
 * new place is also added to that trip.
 */
export default function NewPlaceScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const createPlace = useCreatePlace();
  const addToTrip = useAddTripPlace(tripId ?? '');
  const [error, setError] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('placeForm.newTitle')} mode="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <PlaceForm
            submitLabel={t('placeForm.save')}
            submitting={createPlace.isPending || addToTrip.isPending}
            error={error}
            onSubmit={(values) => {
              setError(null);
              createPlace.mutate(values, {
                onSuccess: (place) => {
                  if (!tripId) {
                    router.back();
                    return;
                  }
                  addToTrip.mutate(place.id, {
                    onSuccess: () => router.back(),
                    // The place is saved; only linking failed. Say so and let them retry from the trip.
                    onError: (linkError) => setError(errorMessage(linkError)),
                  });
                },
                onError: (saveError) => setError(errorMessage(saveError)),
              });
            }}
          />
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
