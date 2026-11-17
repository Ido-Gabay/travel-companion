import type { Place } from '@travel-companion/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Card, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme/tokens';

export function PlaceCard({ place, onPress }: { place: Place; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Card onPress={onPress} accessibilityLabel={place.name}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Icon name="location-outline" size={20} color={colors.accent} />
        </View>
        <View style={styles.text}>
          <AppText variant="heading" numberOfLines={1}>
            {place.name}
          </AppText>
          {place.address ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {place.address}
            </AppText>
          ) : null}
          {place.notes ? (
            <AppText variant="body" color="secondary" numberOfLines={2}>
              {place.notes}
            </AppText>
          ) : null}
          {place.tripCount > 0 ? (
            <AppText variant="caption" color="accent">
              {t('places.tripCount', { count: place.tripCount })}
            </AppText>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textTertiary} flipInRtl />
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
  text: { flex: 1, gap: spacing.xxs },
});
