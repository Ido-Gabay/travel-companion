import { createTripSchema } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, IconButton, InlineError, TextField } from '@/components/ui';
import { DateField } from '@/features/trips/DateField';
import { useCreateTrip } from '@/features/trips/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function NewTripScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const createTrip = useCreateTrip();

  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const datesInvalid = startDate !== null && endDate !== null && endDate < startDate;

  const submit = () => {
    const parsed = createTripSchema.safeParse({ title, destination, startDate, endDate });
    if (!parsed.success) {
      setTitleError(title.trim() ? null : t('createTrip.nameRequired'));
      return;
    }
    setTitleError(null);
    createTrip.mutate(parsed.data, { onSuccess: () => router.back() });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header" style={styles.flex}>
          {t('createTrip.title')}
        </AppText>
        <IconButton icon="close" accessibilityLabel={t('common.cancel')} onPress={() => router.back()} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label={t('createTrip.name')}
            placeholder={t('createTrip.namePlaceholder')}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              if (titleError) setTitleError(null);
            }}
            error={titleError}
            maxLength={120}
            autoFocus
            returnKeyType="next"
          />
          <TextField
            label={t('createTrip.destination')}
            placeholder={t('createTrip.destinationPlaceholder')}
            value={destination}
            onChangeText={setDestination}
            maxLength={120}
            returnKeyType="done"
          />

          <View style={styles.dates}>
            <AppText variant="caption" color="secondary" style={styles.label}>
              {t('createTrip.dates')}
            </AppText>
            <Card>
              <DateField
                label={t('createTrip.startDate')}
                value={startDate}
                onChange={(value) => {
                  setStartDate(value);
                  if (value && endDate && endDate < value) setEndDate(value);
                }}
              />
              <View style={styles.divider} />
              <DateField
                label={t('createTrip.endDate')}
                value={endDate}
                onChange={setEndDate}
                minimumDate={startDate}
              />
            </Card>
            {datesInvalid ? <InlineError message={t('createTrip.endBeforeStart')} /> : null}
          </View>

          {createTrip.isError ? <InlineError message={errorMessage(createTrip.error)} /> : null}

          <Button
            label={t('createTrip.submit')}
            onPress={submit}
            loading={createTrip.isPending}
            disabled={!title.trim() || datesInvalid}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl },
  dates: { gap: spacing.xs },
  label: { fontWeight: '600' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
});
