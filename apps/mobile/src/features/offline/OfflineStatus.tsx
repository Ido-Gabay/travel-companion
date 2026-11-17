import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';
import { ConflictSheet } from './ConflictSheet';
import { useConnection } from './connection';
import { syncPending, usePendingState } from './ops-store';

export function formatSavedAt(savedAt: number, nowMs: number, locale: string): string {
  const saved = new Date(savedAt);
  const sameDay = new Date(nowMs).toDateString() === saved.toDateString();
  return saved.toLocaleString(
    locale,
    sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  );
}

/**
 * Where the data on screen comes from, and what hasn't synced yet (M12a). Shows
 * nothing when everything is fresh and synced. Otherwise up to three quiet lines:
 * "Offline · saved copy from 10:42", "2 changes waiting to sync · Sync now",
 * "1 change needs your choice · Review".
 */
export function OfflineStatus({ savedAt, stale }: { savedAt: number; stale: boolean }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const connection = useConnection();
  const { ops, conflicts, syncing } = usePendingState();
  const [reviewing, setReviewing] = useState(false);
  const offline = connection === 'offline';
  const showConnection = offline || stale;
  if (!showConnection && ops.length === 0 && conflicts.length === 0) return null;
  const when = savedAt > 0 ? formatSavedAt(savedAt, Date.now(), locale) : null;
  const label = offline ? t('offline.offline') : t('offline.notRefreshed');
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      {showConnection ? (
        <View style={styles.row}>
          <Icon name="cloud-offline-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="secondary" style={styles.flex}>
            {when ? t('offline.savedCopy', { status: label, time: when }) : label}
          </AppText>
        </View>
      ) : null}
      {ops.length > 0 ? (
        <View style={styles.row}>
          <Icon name="cloud-upload-outline" size={16} color={colors.accent} />
          <AppText variant="caption" color="secondary" style={styles.flex}>
            {syncing ? t('offline.syncing') : t('offline.pending', { count: ops.length })}
          </AppText>
          {!syncing ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void syncPending(queryClient)}>
              <AppText variant="caption" color="accent" style={styles.bold}>
                {t('offline.syncNow')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {conflicts.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setReviewing(true)} style={styles.row}>
          <Icon name="alert-circle-outline" size={16} color={colors.danger} />
          <AppText variant="caption" color="danger" style={styles.flex}>
            {t('offline.conflicts', { count: conflicts.length })}
          </AppText>
          <AppText variant="caption" color="accent" style={styles.bold}>
            {t('offline.review')}
          </AppText>
        </Pressable>
      ) : null}
      <ConflictSheet visible={reviewing} onClose={() => setReviewing(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
});
