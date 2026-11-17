import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface NavHeaderProps {
  /** Optional; detail screens often show their own large title below. */
  title?: string;
  /** "back" for pushed screens, "close" for modals. */
  mode?: 'back' | 'close';
  action?: ReactNode;
}

/** Top bar for screens outside the tabs: back (or close), title, optional action. */
export function NavHeader({ title, mode = 'back', action }: NavHeaderProps) {
  const { t } = useTranslation();
  const leading =
    mode === 'back' ? (
      <IconButton icon="arrow-back" flipInRtl accessibilityLabel={t('common.back')} onPress={() => router.back()} />
    ) : null;
  const trailing =
    mode === 'close' ? (
      <IconButton icon="close" accessibilityLabel={t('common.cancel')} onPress={() => router.back()} />
    ) : (
      action ?? null
    );

  return (
    <View style={styles.row}>
      {leading}
      <AppText variant={mode === 'close' ? 'title' : 'heading'} accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title ?? ''}
      </AppText>
      {mode === 'close' && action ? action : null}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    minHeight: 56,
  },
  title: { flex: 1 },
});
