import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Icon, Sheet } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';
import { formatStartTime, fromStartTime, toStartTime } from './itinerary';

export interface TimeSheetValue {
  /** "HH:MM" or null (flexible). */
  startTime: string | null;
  /** Planned visit length, or null for the category default. */
  durationMinutes: number | null;
}

interface TimeSheetProps {
  visible: boolean;
  placeName: string;
  value: TimeSheetValue;
  /** The category default, shown on the "Default" choice. */
  defaultDuration: number;
  /** Hide the duration choices (e.g. when only picking a time). */
  showDuration?: boolean;
  title?: string;
  onSave: (value: TimeSheetValue) => void;
  onClose: () => void;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180] as const;

/** Set a stop's start time (or leave it flexible) and how long the visit takes. */
export function TimeSheet({
  visible,
  placeName,
  value,
  defaultDuration,
  showDuration = true,
  title,
  onSave,
  onClose,
}: TimeSheetProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [time, setTime] = useState(() => fromStartTime(value.startTime));
  const [hasTime, setHasTime] = useState(value.startTime !== null);
  const [duration, setDuration] = useState<number | null>(value.durationMinutes);

  useEffect(() => {
    if (visible) {
      setTime(fromStartTime(value.startTime));
      setHasTime(value.startTime !== null);
      setDuration(value.durationMinutes);
    }
  }, [visible, value.startTime, value.durationMinutes]);

  const pickAndroid = () =>
    DateTimePickerAndroid.open({
      value: time,
      mode: 'time',
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          setTime(date);
          setHasTime(true);
        }
      },
    });

  return (
    <Sheet
      visible={visible}
      title={title ?? (showDuration ? t('itinerary.timeAndDuration') : t('itinerary.setTime'))}
      subtitle={placeName}
      onClose={onClose}
      footer={
        <Button
          label={t('common.save')}
          onPress={() => onSave({ startTime: hasTime ? toStartTime(time) : null, durationMinutes: duration })}
        />
      }
    >
      <View style={styles.section}>
        <View style={styles.row}>
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('itinerary.startTime')}
          </AppText>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !hasTime }}
            onPress={() => setHasTime((current) => !current)}
            style={[styles.chip, !hasTime && styles.chipOn]}
          >
            <AppText variant="caption" style={[styles.chipText, !hasTime && styles.chipTextOn]}>
              {t('itinerary.flexible')}
            </AppText>
          </Pressable>
        </View>
        {hasTime ? (
          Platform.OS === 'ios' ? (
            <View style={styles.picker}>
              <DateTimePicker
                value={time}
                mode="time"
                display="spinner"
                locale={locale}
                minuteInterval={5}
                textColor={colors.text}
                onChange={(_event, date) => {
                  if (date) setTime(date);
                }}
              />
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={pickAndroid} style={styles.androidTime}>
              <Icon name="time-outline" size={18} color={colors.accent} />
              <AppText variant="title">{formatStartTime(toStartTime(time), locale)}</AppText>
            </Pressable>
          )
        ) : (
          <AppText variant="caption" color="secondary">
            {t('itinerary.flexibleHint')}
          </AppText>
        )}
      </View>

      {showDuration ? (
        <View style={styles.section}>
          <AppText variant="bodyStrong">{t('itinerary.duration')}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: duration === null }}
              onPress={() => setDuration(null)}
              style={[styles.chip, duration === null && styles.chipOn]}
            >
              <AppText variant="caption" style={[styles.chipText, duration === null && styles.chipTextOn]}>
                {t('itinerary.durationDefault', { minutes: defaultDuration })}
              </AppText>
            </Pressable>
            {DURATIONS.map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityRole="radio"
                accessibilityState={{ selected: duration === minutes }}
                onPress={() => setDuration(minutes)}
                style={[styles.chip, duration === minutes && styles.chipOn]}
              >
                <AppText variant="caption" style={[styles.chipText, duration === minutes && styles.chipTextOn]}>
                  {formatDurationShort(minutes, t)}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
          <AppText variant="caption" color="secondary">
            {t('itinerary.durationHint')}
          </AppText>
        </View>
      ) : null}
    </Sheet>
  );
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatDurationShort(minutes: number, t: TFunction): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t('itinerary.minutes', { m });
  if (m === 0) return t('itinerary.hours', { h });
  return t('itinerary.hoursMinutes', { h, m });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  picker: { alignItems: 'center' },
  androidTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  chips: { gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontWeight: '600', color: colors.textSecondary },
  chipTextOn: { color: colors.textOnAccent },
});
