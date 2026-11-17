import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NavHeader } from '@/components/ui';
import { useCreateTrip } from '@/features/trips/queries';
import { TripForm } from '@/features/trips/TripForm';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function NewTripScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const createTrip = useCreateTrip();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('createTrip.title')} mode="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TripForm
            submitLabel={t('createTrip.submit')}
            submitting={createTrip.isPending}
            error={createTrip.isError ? errorMessage(createTrip.error) : null}
            onSubmit={(values) => createTrip.mutate(values, { onSuccess: () => router.back() })}
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
