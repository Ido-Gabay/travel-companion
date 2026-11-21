import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import { colors, hitSlop, radii, spacing } from '@/theme/tokens';
import { addMonths, inRange, monthGrid, pickDay, type DateRange } from './date-range';

const utc = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));

/**
 * The trip's dates on one calendar: tap the first day, then the last. The
 * range is drawn as one band, so the selection reads at a glance; an end
 * before the start can't be picked. Week starts on Sunday (Israel, the US).
 */
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const today = toIsoDate(new Date());
  const anchor = value.start ?? today;
  const [shown, setShown] = useState({ year: +anchor.slice(0, 4), month: +anchor.slice(5, 7) - 1 });
  const weeks = useMemo(() => monthGrid(shown.year, shown.month), [shown]);
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(shown.year, shown.month, 1)),
  );
  // Sunday Nov 1, 2026 onward: the seven weekday initials in the app language.
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2026, 10, 1 + i))));
  }, [locale]);
  const dayLabel = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }), [locale]);
  const move = (count: number) => setShown((current) => addMonths(current.year, current.month, count));

  return (
    <View style={styles.calendar}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('createTrip.prevMonth')} hitSlop={hitSlop} onPress={() => move(-1)} style={styles.nav}>
          <Icon name="chevron-back" size={20} color={colors.text} flipInRtl />
        </Pressable>
        <AppText variant="heading" align="center" style={styles.flex} accessibilityRole="header">
          {monthTitle}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('createTrip.nextMonth')} hitSlop={hitSlop} onPress={() => move(1)} style={styles.nav}>
          <Icon name="chevron-forward" size={20} color={colors.text} flipInRtl />
        </Pressable>
      </View>
      <View style={styles.week}>
        {weekdays.map((name, i) => (
          <AppText key={i} variant="caption" color="tertiary" align="center" style={styles.cell}>
            {name}
          </AppText>
        ))}
      </View>
      {weeks.map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((day, column) => {
            if (!day) return <View key={column} style={styles.cell} />;
            const isStart = day === value.start;
            const isEnd = day === value.end;
            const edge = isStart || isEnd;
            const between = inRange(day, value);
            const band = between || (value.start && value.end && value.start !== value.end && edge);
            return (
              <View key={day} style={styles.cell}>
                {band ? (
                  <View
                    style={[
                      styles.band,
                      // The band runs from the start's middle to the end's middle (logical sides follow RTL).
                      isStart ? styles.bandFromMiddle : null,
                      isEnd ? styles.bandToMiddle : null,
                    ]}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={dayLabel.format(utc(day))}
                  accessibilityState={{ selected: edge || between }}
                  testID={`day-${day}`}
                  onPress={() => onChange(pickDay(value, day))}
                  style={({ pressed }) => [styles.day, edge && styles.dayEdge, pressed && !edge && styles.dayPressed]}
                >
                  <AppText
                    variant={edge ? 'bodyStrong' : 'body'}
                    color={edge ? 'onAccent' : 'primary'}
                    align="center"
                    style={day === today && !edge ? styles.today : undefined}
                  >
                    {+day.slice(8, 10)}
                  </AppText>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const DAY = 40;

const styles = StyleSheet.create({
  calendar: { gap: spacing.xs },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  week: { flexDirection: 'row' },
  cell: { flex: 1, height: DAY + 4, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: 2, bottom: 2, start: 0, end: 0, backgroundColor: colors.accentSoft },
  bandFromMiddle: { start: '50%' },
  bandToMiddle: { end: '50%' },
  day: { width: DAY, height: DAY, borderRadius: DAY / 2, alignItems: 'center', justifyContent: 'center' },
  dayEdge: { backgroundColor: colors.accent },
  dayPressed: { backgroundColor: colors.surfaceMuted },
  today: { textDecorationLine: 'underline', fontWeight: '600' },
});
