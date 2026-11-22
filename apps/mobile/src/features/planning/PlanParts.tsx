import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import { colors, compactHitSlop, radii, spacing, weights } from '@/theme/tokens';
import { loadState } from './plan-summary';

export type TagTone = 'neutral' | 'accent' | 'danger' | 'success';

/** A short, scannable fact ("Best fit", "Near MoMA", "−12 min travel"). */
export function Tag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  return (
    <View style={[styles.tag, toneStyles[tone].bg]}>
      <AppText variant="caption" style={[styles.tagText, toneStyles[tone].text]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function Tags({ labels, tone }: { labels: readonly (string | null | undefined | false)[]; tone?: TagTone }) {
  const shown = labels.filter((label): label is string => Boolean(label));
  if (shown.length === 0) return null;
  return (
    <View style={styles.tags}>
      {shown.map((label) => (
        <Tag key={label} label={label} tone={tone} />
      ))}
    </View>
  );
}

/** A thin bar of the day's planned time against what the day holds, with free (or over) time beside it. */
export function LoadBar({ usedMinutes, capacityMinutes }: { usedMinutes: number; capacityMinutes: number }) {
  const { t } = useTranslation();
  const load = loadState(usedMinutes, capacityMinutes);
  const over = load.overMinutes > 0;
  return (
    <View
      style={styles.loadRow}
      accessible
      accessibilityLabel={t('tripPlan.loadA11y', {
        load: formatDurationShort(usedMinutes, t),
        available: formatDurationShort(capacityMinutes, t),
      })}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(load.share * 100)}%` }, over && styles.fillOver]} />
      </View>
      <AppText variant="caption" color={over ? 'danger' : 'secondary'} style={styles.loadText}>
        {over
          ? t('tripPlan.loadOver', { time: formatDurationShort(load.overMinutes, t) })
          : t('tripPlan.loadFree', { time: formatDurationShort(load.freeMinutes, t) })}
      </AppText>
    </View>
  );
}

/**
 * One proposed change: included by default, one tap to leave it out (and back).
 * The whole row is the control, so there's no separate switch to find.
 */
export function ChangeRow({
  label,
  tags = [],
  value,
  onChange,
}: {
  label: string;
  tags?: readonly (string | null | undefined | false)[];
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={value ? t('tripPlan.changeOnHint') : t('tripPlan.changeOffHint')}
      onPress={() => onChange(!value)}
      hitSlop={compactHitSlop}
      style={({ pressed }) => [styles.change, pressed && styles.pressed]}
    >
      <Icon name={value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={value ? colors.accent : colors.textTertiary} />
      <View style={styles.flex}>
        <AppText variant="body" color={value ? 'primary' : 'tertiary'}>
          {label}
        </AppText>
        {value ? <Tags labels={tags} /> : <AppText variant="caption" color="tertiary">{t('tripPlan.leftOut')}</AppText>}
      </View>
    </Pressable>
  );
}

/**
 * One stop in a day's plan: travel to it, its time, its name and tags. A stop
 * the plan proposes (new or moved here) carries its own on/off: the whole row is
 * the switch, so each place appears once per day.
 */
export function PlanVisitRow({
  time,
  timeTone = 'secondary',
  timeStrong = false,
  travel = null,
  travelMode = 'walk',
  name,
  tags = [],
  done = false,
  toggle = null,
}: {
  time: string | null;
  timeTone?: 'accent' | 'secondary' | 'tertiary';
  timeStrong?: boolean;
  travel?: string | null;
  travelMode?: 'walk' | 'transit';
  name: string;
  tags?: readonly (string | null | undefined | false)[];
  done?: boolean;
  /** A proposed stop: its label for VoiceOver ("Add Zoo"), whether it's in, and the switch. */
  toggle?: { label: string; value: boolean; onChange: (value: boolean) => void } | null;
}) {
  const { t } = useTranslation();
  const off = toggle !== null && !toggle.value;
  const content = (
    <>
      <View style={styles.lead}>
        {toggle ? (
          <Icon name={toggle.value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={toggle.value ? colors.accent : colors.textTertiary} />
        ) : (
          <View style={[styles.dot, done && styles.dotDone]} />
        )}
      </View>
      <AppText
        variant="caption"
        color={off ? 'tertiary' : timeTone}
        style={[styles.time, timeStrong && !off ? styles.strong : null]}
        numberOfLines={1}
      >
        {off || time === null ? '—' : time}
      </AppText>
      <View style={styles.flex}>
        <AppText variant="body" color={off || done ? 'tertiary' : 'primary'} numberOfLines={1}>
          {name}
        </AppText>
        {off ? (
          <AppText variant="caption" color="tertiary">
            {t('tripPlan.leftOut')}
          </AppText>
        ) : (
          <Tags labels={tags} tone="accent" />
        )}
      </View>
    </>
  );
  return (
    <View style={styles.visit}>
      {travel && !off ? (
        <View style={styles.travel}>
          <Icon name={travelMode === 'transit' ? 'train-outline' : 'walk-outline'} size={14} color={colors.textTertiary} />
          <AppText variant="caption" color="tertiary">
            {travel}
          </AppText>
        </View>
      ) : null}
      {toggle ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: toggle.value }}
          accessibilityLabel={toggle.label}
          accessibilityHint={toggle.value ? t('tripPlan.changeOnHint') : t('tripPlan.changeOffHint')}
          onPress={() => toggle.onChange(!toggle.value)}
          hitSlop={compactHitSlop}
          style={({ pressed }) => [styles.visitRow, styles.touch, pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.visitRow}>{content}</View>
      )}
    </View>
  );
}

/** Jump to one day of a long plan (or see them all). */
export function DayPills({
  days,
  selected,
  onSelect,
}: {
  days: readonly { day: string; label: string; title: string }[];
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const { t } = useTranslation();
  const pill = (key: string, label: string, on: boolean, a11y: string, press: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={a11y}
      onPress={press}
      hitSlop={compactHitSlop}
      style={[styles.pill, on && styles.pillOn]}
    >
      <AppText variant="caption" style={[styles.strong, on ? styles.pillTextOn : null]}>
        {label}
      </AppText>
    </Pressable>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      {pill('all', t('tripPlan.allDays'), selected === null, t('tripPlan.allDays'), () => onSelect(null))}
      {days.map((item) =>
        pill(item.day, item.label, selected === item.day, t('tripPlan.dayFilterA11y', { day: item.title }), () => onSelect(item.day)),
      )}
    </ScrollView>
  );
}

const toneStyles = {
  neutral: StyleSheet.create({ bg: { backgroundColor: colors.surfaceMuted }, text: { color: colors.textSecondary } }),
  accent: StyleSheet.create({ bg: { backgroundColor: colors.accentSoft }, text: { color: colors.accent } }),
  danger: StyleSheet.create({ bg: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } }),
  success: StyleSheet.create({ bg: { backgroundColor: colors.successSoft }, text: { color: colors.success } }),
};

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  pressed: { opacity: 0.7 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radii.pill, maxWidth: '100%' },
  tagText: { fontWeight: weights.semibold },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.accent },
  fillOver: { backgroundColor: colors.danger },
  loadText: { fontWeight: weights.semibold },
  change: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
  visit: { gap: spacing.xxs },
  travel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingStart: 22 + 64 + spacing.sm * 2 },
  visitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  touch: { minHeight: 44, paddingVertical: spacing.xxs },
  lead: { width: 22, alignItems: 'center', paddingTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.accent },
  dotDone: { backgroundColor: colors.textTertiary },
  time: { width: 64, paddingTop: 2 },
  strong: { fontWeight: weights.semibold },
  pills: { gap: spacing.xs, paddingVertical: compactHitSlop.top },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.surface },
  pillOn: { backgroundColor: colors.accent },
  pillTextOn: { color: colors.textOnAccent },
});
