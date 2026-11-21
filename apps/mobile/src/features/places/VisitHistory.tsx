import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { dayTitle } from '@/features/trips/itinerary';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, spacing } from '@/theme/tokens';
import { usePlaceVisits } from './queries';

/** D1 · When the user has been here: done visits (with their trip) and the older "visited" mark. */
export function VisitHistory({ placeId }: { placeId: string }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const visits = usePlaceVisits(placeId);
  const items = visits.data?.items ?? [];
  if (items.length === 0) {
    return (
      <AppText variant="caption" color="secondary">
        {visits.isPending ? t('common.loading') : t('visits.noHistory')}
      </AppText>
    );
  }
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.stopId ?? item.completedAt} style={styles.row}>
          <Icon name={item.source === 'visit' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={colors.success} />
          <AppText variant="body" style={styles.flex}>
            {item.source === 'visit' && item.day
              ? [dayTitle(item.day, locale), item.tripTitle].filter(Boolean).join(' · ')
              : t('visits.markedVisited', {
                  date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.completedAt)),
                })}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
