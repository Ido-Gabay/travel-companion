import {
  createTripSchema,
  TRIP_BASE_LOCATION_MAX,
  TRIP_DESTINATION_MAX,
  TRIP_TITLE_MAX,
} from '@travel-companion/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, InlineError, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { DateField } from './DateField';

export interface TripFormValues {
  title: string;
  destination: string | null;
  baseLocation: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface TripFormProps {
  initial?: TripFormValues;
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: TripFormValues) => void;
}

/** Name, destination, where you're staying, and dates. Used to create and edit trips. */
export function TripForm({ initial, submitLabel, submitting, error, onSubmit }: TripFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [baseLocation, setBaseLocation] = useState(initial?.baseLocation ?? '');
  const [startDate, setStartDate] = useState<string | null>(initial?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(initial?.endDate ?? null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const datesInvalid = startDate !== null && endDate !== null && endDate < startDate;
  const changed =
    !initial ||
    title.trim() !== initial.title ||
    (destination.trim() || null) !== initial.destination ||
    (baseLocation.trim() || null) !== initial.baseLocation ||
    startDate !== initial.startDate ||
    endDate !== initial.endDate;

  const submit = () => {
    const parsed = createTripSchema.safeParse({ title, destination, baseLocation, startDate, endDate });
    if (!parsed.success) {
      setTitleError(title.trim() ? null : t('createTrip.nameRequired'));
      return;
    }
    setTitleError(null);
    onSubmit(parsed.data);
  };

  return (
    <View style={styles.form}>
      <TextField
        label={t('createTrip.name')}
        placeholder={t('createTrip.namePlaceholder')}
        value={title}
        onChangeText={(value) => {
          setTitle(value);
          if (titleError) setTitleError(null);
        }}
        error={titleError}
        maxLength={TRIP_TITLE_MAX}
        autoFocus={!initial}
        returnKeyType="next"
      />
      <TextField
        label={t('createTrip.destination')}
        placeholder={t('createTrip.destinationPlaceholder')}
        value={destination}
        onChangeText={setDestination}
        maxLength={TRIP_DESTINATION_MAX}
        returnKeyType="next"
      />
      <TextField
        label={t('createTrip.baseLocation')}
        placeholder={t('createTrip.baseLocationPlaceholder')}
        hint={t('createTrip.baseLocationHint')}
        value={baseLocation}
        onChangeText={setBaseLocation}
        maxLength={TRIP_BASE_LOCATION_MAX}
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
          <DateField label={t('createTrip.endDate')} value={endDate} onChange={setEndDate} minimumDate={startDate} />
        </Card>
        {datesInvalid ? <InlineError message={t('createTrip.endBeforeStart')} /> : null}
      </View>

      {error ? <InlineError message={error} /> : null}

      <Button
        label={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={!title.trim() || datesInvalid || !changed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl },
  dates: { gap: spacing.xs },
  label: { fontWeight: '600' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
});
