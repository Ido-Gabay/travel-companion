import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { AppText } from './AppText';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional action on the trailing side (e.g. an IconButton). */
  action?: ReactNode;
}

export function ScreenHeader({ title, subtitle, action }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" color="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  action: { paddingTop: spacing.xs },
});
