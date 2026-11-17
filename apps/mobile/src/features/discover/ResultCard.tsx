import type { DiscoverResult } from '@travel-companion/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { CATEGORY_ICONS } from '@/features/places/categories';
import { colors, hitSlop, radii, shadows, spacing } from '@/theme/tokens';

interface ResultCardProps {
  result: DiscoverResult;
  selected: boolean;
  /** Already saved (and, when a trip is chosen, already in that trip). */
  alreadySaved: boolean;
  savedLabel: string;
  /** "350 m" when searching near the user. */
  distance?: string | null;
  onToggle: () => void;
  onOpen: () => void;
}

/** One Google result. Tap the card to see the place; tap the circle to select it for saving. */
export function ResultCard({ result, selected, alreadySaved, savedLabel, distance, onToggle, onOpen }: ResultCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={result.name}
      accessibilityHint={t('discover.openHint')}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.badge}>
        <Icon name={CATEGORY_ICONS[result.category]} size={20} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <AppText variant="heading" numberOfLines={2}>
          {result.name}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={1}>
          {[result.typeLabel, distance].filter(Boolean).join(' · ')}
        </AppText>
        {result.address ? (
          <AppText variant="caption" color="tertiary" numberOfLines={1}>
            {result.address}
          </AppText>
        ) : null}
        {result.businessStatus === 'CLOSED_TEMPORARILY' || alreadySaved ? (
          <View style={styles.footer}>
            {result.businessStatus === 'CLOSED_TEMPORARILY' ? (
              <AppText variant="caption" color="danger">
                {t('discover.temporarilyClosed')}
              </AppText>
            ) : null}
            {alreadySaved ? (
              <View style={styles.savedPill}>
                <Icon name="checkmark" size={13} color={colors.success} />
                <AppText variant="caption" style={styles.savedText}>
                  {savedLabel}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected || alreadySaved, disabled: alreadySaved }}
        accessibilityLabel={t('discover.selectPlace', { name: result.name })}
        disabled={alreadySaved}
        hitSlop={hitSlop}
        onPress={onToggle}
        style={styles.checkArea}
      >
        <View style={[styles.check, (selected || alreadySaved) && styles.checkOn, alreadySaved && styles.checkSaved]}>
          {selected || alreadySaved ? <Icon name="checkmark" size={16} color={colors.textOnAccent} /> : null}
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.card,
  },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.85 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xxs },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xxs },
  savedPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  savedText: { color: colors.success, fontWeight: '600' },
  checkArea: { padding: spacing.xs },
  check: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkSaved: { backgroundColor: colors.success, borderColor: colors.success },
});
