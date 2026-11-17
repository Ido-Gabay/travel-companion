import type { UsageItem } from '@travel-companion/shared';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText, Card, ErrorState, LoadingState, NavHeader } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Cost monitoring: this server's paid API usage today and this month, against
 * its caps and Google's free allowance. Google's own billing console is the
 * final word; this is the app's own count.
 */
export default function UsageScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const usage = useQuery({ queryKey: ['usage'], queryFn: api.getUsage });

  const total = usage.data?.items.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('usage.title')} mode="close" />
      <ScrollView contentContainerStyle={styles.content}>
        {usage.isPending ? (
          <LoadingState />
        ) : usage.isError ? (
          <ErrorState message={errorMessage(usage.error)} onRetry={() => void usage.refetch()} />
        ) : (
          <>
            <Card>
              <AppText variant="caption" color="secondary">
                {t('usage.estimate', { month: usage.data.month })}
              </AppText>
              <AppText variant="display" style={total > 0 ? styles.cost : undefined}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
              </AppText>
              <AppText variant="caption" color="secondary">
                {t('usage.estimateHint')}
              </AppText>
            </Card>
            {usage.data.items.map((item) => (
              <UsageRow key={item.metric} item={item} />
            ))}
            <AppText variant="caption" color="tertiary">
              {t('usage.footnote')}
            </AppText>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageRow({ item }: { item: UsageItem }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const limit = item.freePerMonth !== null ? Math.min(item.monthlyCap, item.freePerMonth) : item.monthlyCap;
  const share = limit > 0 ? Math.min(1, item.month / limit) : 0;
  const warn = share >= 0.8;

  return (
    <Card>
      <View style={styles.rowHead}>
        <AppText variant="heading" style={styles.flex}>
          {t(`usage.metric.${item.metric}`)}
        </AppText>
        <AppText variant="caption" color={warn ? 'danger' : 'secondary'} style={styles.bold}>
          {number(item.month)} / {number(limit)}
        </AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }, warn && styles.fillWarn]} />
      </View>
      <AppText variant="caption" color="secondary">
        {t('usage.today', { today: number(item.today), cap: number(item.dailyCap) })}
      </AppText>
      <AppText variant="caption" color="tertiary">
        {item.freePerMonth !== null && item.usdPer1000 !== null
          ? t('usage.pricing', {
              sku: item.sku,
              free: number(item.freePerMonth),
              price: item.usdPer1000.toFixed(2),
              cap: number(item.monthlyCap),
            })
          : t('usage.pricingTokens', { sku: item.sku, cap: number(item.monthlyCap) })}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  cost: { color: colors.danger },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginBottom: spacing.sm },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.accent },
  fillWarn: { backgroundColor: colors.danger },
});
