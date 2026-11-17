import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, Icon, InlineError, NavHeader } from '@/components/ui';
import { getOurScheduled, getPermission, requestPermission, sendTestReminder } from '@/features/companion/notifications';
import { useReminderSettings, useUpdateReminderSettings } from '@/features/companion/reminder-settings';
import { LEAD_OPTIONS, type ReminderSettings } from '@/features/companion/reminders';
import { reminderStatusKey, type ReminderStatus } from '@/features/companion/ReminderSync';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Reminder settings (stored on this phone) and what is scheduled right now.
 * Permission is asked only when the user turns reminders on.
 */
export default function RemindersScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const settings = useReminderSettings();
  const update = useUpdateReminderSettings();
  const status = queryClient.getQueryData<ReminderStatus>(reminderStatusKey);
  const permission = useQuery({ queryKey: ['reminders', 'permission'], queryFn: getPermission });
  const scheduled = useQuery({ queryKey: ['reminders', 'scheduled', status?.at ?? 0], queryFn: getOurScheduled });
  const [testSent, setTestSent] = useState(false);

  const value = settings.data;
  const enabled = value?.enabled ?? false;
  const denied = permission.data === 'denied';

  const set = (patch: Partial<ReminderSettings>) => update.mutate(patch);

  const toggleEnabled = async (next: boolean) => {
    if (!next) {
      set({ enabled: false });
      return;
    }
    const result = await requestPermission();
    void permission.refetch();
    if (result === 'granted') set({ enabled: true });
  };

  const formatFire = (ms: number | null) =>
    ms === null
      ? ''
      : new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
          ...(status?.timeZone ? { timeZone: status.timeZone } : {}),
        }).format(ms);

  const upcoming = (scheduled.data ?? [])
    .filter((item) => item.fireAtMs !== null)
    .sort((a, b) => (a.fireAtMs ?? 0) - (b.fireAtMs ?? 0));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('reminders.title')} mode="close" />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="body" color="secondary">
          {t('reminders.intro')}
        </AppText>

        <Card>
          <Row label={t('reminders.enable')} hint={t('reminders.enableHint')}>
            <Switch value={enabled} onValueChange={(next) => void toggleEnabled(next)} trackColor={{ true: colors.accent }} />
          </Row>
        </Card>

        {denied ? (
          <View style={styles.notice}>
            <Icon name="notifications-off-outline" size={18} color={colors.danger} />
            <AppText variant="body" style={styles.flex}>
              {t('reminders.denied')}
            </AppText>
            <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
              <AppText variant="bodyStrong" color="accent">
                {t('discover.openSettings')}
              </AppText>
            </Pressable>
          </View>
        ) : null}
        {update.isError ? <InlineError message={String(update.error)} /> : null}

        <Card style={!enabled && styles.disabled}>
          <Row label={t('reminders.leaveSoon')} hint={t('reminders.leaveSoonHint', { min: value?.leadMinutes ?? 10 })}>
            <Switch
              value={value?.leaveSoon ?? false}
              disabled={!enabled}
              onValueChange={(next) => set({ leaveSoon: next })}
              trackColor={{ true: colors.accent }}
            />
          </Row>
          <View style={styles.leadRow}>
            {LEAD_OPTIONS.map((lead) => {
              const on = value?.leadMinutes === lead;
              return (
                <Pressable
                  key={lead}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  disabled={!enabled || !value?.leaveSoon}
                  onPress={() => set({ leadMinutes: lead })}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <AppText variant="caption" style={[styles.chipText, on && styles.chipTextOn]}>
                    {t('itinerary.minutes', { m: lead })}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.divider} />
          <Row label={t('reminders.leaveNow')} hint={t('reminders.leaveNowHint')}>
            <Switch value={value?.leaveNow ?? false} disabled={!enabled} onValueChange={(next) => set({ leaveNow: next })} trackColor={{ true: colors.accent }} />
          </Row>
          <View style={styles.divider} />
          <Row label={t('reminders.headsUp')} hint={t('reminders.headsUpHint')}>
            <Switch value={value?.headsUp ?? false} disabled={!enabled} onValueChange={(next) => set({ headsUp: next })} trackColor={{ true: colors.accent }} />
          </Row>
          <View style={styles.divider} />
          <Row label={t('reminders.morning')} hint={t('reminders.morningHint')}>
            <Switch
              value={value?.morningSummary ?? false}
              disabled={!enabled}
              onValueChange={(next) => set({ morningSummary: next })}
              trackColor={{ true: colors.accent }}
            />
          </Row>
        </Card>

        {enabled && status?.preserved ? (
          <View style={styles.notice}>
            <Icon name="cloud-offline-outline" size={18} color={colors.accent} />
            <AppText variant="body" style={styles.flex}>
              {t('reminders.preservedOffline')}
            </AppText>
          </View>
        ) : null}

        {enabled && status?.tripId && !status.timeZone && !status.preserved ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => status.tripId && router.push({ pathname: '/trips/[id]', params: { id: status.tripId } })}
            style={styles.notice}
          >
            <Icon name="globe-outline" size={18} color={colors.accent} />
            <AppText variant="body" style={styles.flex}>
              {t('reminders.noTimeZone')}
            </AppText>
          </Pressable>
        ) : null}

        <View style={styles.section}>
          <AppText variant="label" color="secondary">
            {t('reminders.scheduled', { count: upcoming.length })}
          </AppText>
          {status?.error ? <InlineError message={status.error} /> : null}
          {upcoming.length === 0 ? (
            <AppText variant="caption" color="secondary">
              {enabled ? t('reminders.noneScheduled') : t('reminders.offNote')}
            </AppText>
          ) : (
            upcoming.slice(0, 12).map((item) => (
              <View key={item.id} style={styles.item}>
                <Icon name="notifications-outline" size={16} color={colors.accent} />
                <AppText variant="body" style={styles.flex} numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {formatFire(item.fireAtMs)}
                </AppText>
              </View>
            ))
          )}
          {upcoming.length > 12 ? (
            <AppText variant="caption" color="tertiary">
              {t('reminders.more', { count: upcoming.length - 12 })}
            </AppText>
          ) : null}
          {status?.timeZone ? (
            <AppText variant="caption" color="tertiary">
              {t('reminders.timeZone', { zone: status.timeZone })}
            </AppText>
          ) : null}
        </View>

        <Button
          label={testSent ? t('reminders.testSent') : t('reminders.test')}
          icon="paper-plane-outline"
          variant="secondary"
          disabled={!enabled}
          onPress={() => {
            setTestSent(true);
            void sendTestReminder(t('reminders.testTitle'), t('reminders.testBody'), status?.tripId ?? null);
          }}
        />

        <AppText variant="caption" color="tertiary" style={styles.footnote}>
          {t('reminders.footnote')}
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" color="secondary">
          {hint}
        </AppText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.huge },
  flex: { flex: 1 },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  leadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontWeight: '600', color: colors.textSecondary },
  chipTextOn: { color: colors.textOnAccent },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  section: { gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footnote: { textAlign: 'center' },
});
