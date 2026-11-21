import { Pressable, StyleSheet, View } from 'react-native';
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
});
