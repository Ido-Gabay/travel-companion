import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface SheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scrolling content, e.g. a Save button. */
  footer?: ReactNode;
  /** Scroll the content (default true). Turn off for short, fixed content. */
  scroll?: boolean;
}

/**
 * A native page sheet (iOS card that slides up and can be swiped down).
 * Android shows it as a full-screen modal.
 */
export function Sheet({ visible, title, subtitle, onClose, children, footer, scroll = true }: SheetProps) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="caption" color="secondary">
                {subtitle}
              </AppText>
            ) : null}
          </View>
          <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={onClose} />
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fixed]}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.xxs },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  fixed: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
