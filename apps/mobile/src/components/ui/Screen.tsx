import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /** Scrollable content (default true). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
}

/** Page container: safe area, background, consistent padding. */
export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  edges = ['top'],
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xxl,
  },
  fill: { flex: 1 },
});
