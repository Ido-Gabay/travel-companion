import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radii, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body: string;
  /** A real action only. Never pass a control that does nothing. */
  action?: ReactNode;
  note?: string;
}

export function EmptyState({ icon, title, body, action, note }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={24} color={colors.accent} />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="body" color="secondary" align="center">
        {body}
      </AppText>
      {note ? (
        <AppText variant="caption" color="tertiary" align="center">
          {note}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

/** Spinner; after a few seconds it explains that the server may be waking up. */
export function LoadingState() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      {slow ? (
        <AppText variant="caption" color="tertiary" align="center" accessibilityLiveRegion="polite">
          {t('common.wakingUp')}
        </AppText>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.empty, styles.error]}>
      <Icon name="cloud-offline-outline" size={26} color={colors.danger} />
      <AppText variant="body" align="center">
        {message}
      </AppText>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} block={false} /> : null}
    </View>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <View style={styles.inlineError} accessibilityLiveRegion="polite">
      <Icon name="alert-circle-outline" size={18} color={colors.danger} />
      <AppText variant="caption" color="danger" style={styles.flex}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
  error: {},
  center: { paddingVertical: spacing.huge, alignItems: 'center', gap: spacing.md },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  flex: { flex: 1 },
});
