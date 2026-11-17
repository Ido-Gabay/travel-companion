import { googleMapsPlaceUrl, type DiscoverResult } from '@travel-companion/shared';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon, IconButton } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme/tokens';

interface ResultCardProps {
  result: DiscoverResult;
  selected: boolean;
  /** Already saved (and, when a trip is chosen, already in that trip). */
  alreadySaved: boolean;
  savedLabel: string;
  onToggle: () => void;
}

/** One Google result. Tapping toggles selection; saved places can't be re-selected. */
export function ResultCard({ result, selected, alreadySaved, savedLabel, onToggle }: ResultCardProps) {
  const { t } = useTranslation();
  const mapsUrl = result.googleMapsUri ?? googleMapsPlaceUrl(result.placeId, result.name);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected || alreadySaved, disabled: alreadySaved }}
      accessibilityLabel={result.name}
      disabled={alreadySaved}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && !alreadySaved && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <AppText variant="heading" numberOfLines={2}>
          {result.name}
        </AppText>
        {result.typeLabel ? (
          <AppText variant="caption" color="accent" numberOfLines={1}>
            {result.typeLabel}
          </AppText>
        ) : null}
        {result.address ? (
          <AppText variant="caption" color="secondary" numberOfLines={2}>
            {result.address}
          </AppText>
        ) : null}
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
      </View>
      <View style={styles.side}>
        <View style={[styles.check, (selected || alreadySaved) && styles.checkOn]}>
          {selected || alreadySaved ? <Icon name="checkmark" size={16} color={colors.textOnAccent} /> : null}
        </View>
        <IconButton
          icon="navigate-outline"
          accessibilityLabel={t('places.openInGoogleMaps')}
          onPress={() => void Linking.openURL(mapsUrl).catch(() => undefined)}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
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
  text: { flex: 1, gap: spacing.xxs },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  savedPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  savedText: { color: colors.success, fontWeight: '600' },
  side: { alignItems: 'center', justifyContent: 'space-between' },
  check: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
