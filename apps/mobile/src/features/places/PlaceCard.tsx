import type { Place } from '@travel-companion/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Card, Icon } from '@/components/ui';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { colors, radii, spacing } from '@/theme/tokens';
import { CATEGORY_ICONS } from './categories';
import { usePlaceDisplay } from './use-place-display';

interface PlaceCardProps {
  place: Place;
  onPress: () => void;
  /** Optional trailing controls (e.g. remove from trip). */
  actions?: ReactNode;
  showNotes?: boolean;
  /** Small highlighted label, e.g. the day a trip place is planned for. */
  badge?: string | null;
}

export function PlaceCard({ place, onPress, actions, showNotes = true, badge }: PlaceCardProps) {
  const { t } = useTranslation();
  const display = usePlaceDisplay(place);
  const visited = place.visitedAt !== null;

  return (
    <Card onPress={onPress} accessibilityLabel={display.name}>
      <View style={styles.row}>
        <View style={[styles.badge, visited && styles.badgeVisited]}>
          <Icon
            name={visited ? 'checkmark' : CATEGORY_ICONS[place.category]}
            size={20}
            color={visited ? colors.textOnAccent : colors.accent}
          />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <AppText variant="heading" numberOfLines={1} style={styles.flex}>
              {display.name}
            </AppText>
            {display.loading ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
          </View>
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {[display.typeLabel ?? t(`categories.${place.category}`), display.address]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          {showNotes && place.notes ? (
            <AppText variant="body" color="secondary" numberOfLines={2}>
              {place.notes}
            </AppText>
          ) : null}
          {badge ? (
            <View style={styles.planBadge}>
              <Icon name="calendar-outline" size={12} color={colors.accent} />
              <AppText variant="caption" color="accent" style={styles.planBadgeText}>
                {badge}
              </AppText>
            </View>
          ) : null}
          {place.tags.length > 0 ? (
            <View style={styles.tags}>
              {place.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <AppText variant="caption" color="secondary">
                    {tag}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          {place.source === 'google' && display.google ? (
            <GoogleAttribution inline align="start" />
          ) : null}
        </View>
        {actions ?? <Icon name="chevron-forward" size={18} color={colors.textTertiary} flipInRtl />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeVisited: { backgroundColor: colors.success },
  text: { flex: 1, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  planBadgeText: { fontWeight: '600' },
});
