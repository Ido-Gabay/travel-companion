import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme/tokens';

/**
 * Shown instead of the app when apps/mobile/.env is missing or invalid.
 * Developer-facing, so English only and no providers needed.
 */
export function ConfigErrorScreen({ problems }: { problems: string[] }) {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>App is not configured</Text>
          <Text style={styles.body}>
            Create apps/mobile/.env (run `pnpm setup:mobile` from the repo root), then restart
            `pnpm start` with the --clear flag.
          </Text>
          {problems.map((problem) => (
            <Text key={problem} style={styles.problem}>
              • {problem}
            </Text>
          ))}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
  problem: { ...typography.caption, color: colors.danger },
});
