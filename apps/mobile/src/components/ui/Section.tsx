import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { AppText } from './AppText';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="tertiary" accessibilityRole="header">
        {title.toUpperCase()}
      </AppText>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  body: { gap: spacing.md },
});
