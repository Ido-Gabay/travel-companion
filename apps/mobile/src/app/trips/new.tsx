import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NavHeader } from '@/components/ui';
import { useCreateTrip } from '@/features/trips/queries';
import { TripForm } from '@/features/trips/TripForm';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors } from '@/theme/tokens';

export default function NewTripScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const createTrip = useCreateTrip();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('createTrip.title')} mode="close" />
      {/* The form scrolls; its "Create trip" stays above the keyboard. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TripForm
          submitLabel={t('createTrip.submit')}
          submitting={createTrip.isPending}
          error={createTrip.isError ? errorMessage(createTrip.error) : null}
          onSubmit={(values) => createTrip.mutate(values, { onSuccess: () => router.back() })}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
});
