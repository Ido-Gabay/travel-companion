import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates, fromIsoDate, toIsoDate } from '@/lib/dates';
import { colors, hitSlop, radii, spacing } from '@/theme/tokens';

interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD" or null when not set. */
  value: string | null;
  onChange: (value: string | null) => void;
  minimumDate?: string | null;
}

/** An optional calendar date: "Add date" until set, then the native picker plus a clear button. */
export function DateField({ label, value, onChange, minimumDate }: DateFieldProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const min = minimumDate ? fromIsoDate(minimumDate) : undefined;

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: value ? fromIsoDate(value) : (min ?? new Date()),
      mode: 'date',
      minimumDate: min,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(toIsoDate(date));
      },
    });
  };

  return (
    <View style={styles.row}>
      <AppText variant="body" style={styles.label}>
        {label}
      </AppText>

      {value === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${t('createTrip.addDate')}`}
          hitSlop={hitSlop}
          onPress={() =>
            Platform.OS === 'android' ? openAndroid() : onChange(toIsoDate(min ?? new Date()))
          }
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Icon name="add" size={18} color={colors.accent} />
          <AppText variant="bodyStrong" color="accent">
            {t('createTrip.addDate')}
          </AppText>
        </Pressable>
      ) : (
        <View style={styles.valueRow}>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={fromIsoDate(value)}
              mode="date"
              display="compact"
              locale={locale}
              minimumDate={min}
              accentColor={colors.accent}
              onChange={(_event, date) => {
                if (date) onChange(toIsoDate(date));
              }}
            />
          ) : (
            <Pressable accessibilityRole="button" onPress={openAndroid} style={styles.androidValue}>
              <AppText variant="bodyStrong">{formatTripDates(value, null, locale)}</AppText>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${t('common.clear')}`}
            hitSlop={hitSlop}
            onPress={() => onChange(null)}
          >
            <Icon name="close-circle" size={22} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    gap: spacing.md,
  },
  label: { flexShrink: 1 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  pressed: { opacity: 0.7 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  androidValue: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
});
