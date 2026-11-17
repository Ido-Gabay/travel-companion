import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';

/** Shared frame for the sign-in and sign-up screens. */
export function AuthForm({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.back}>
            <IconButton
              icon="arrow-back"
              flipInRtl
              accessibilityLabel={t('common.cancel')}
              onPress={() => router.back()}
            />
          </View>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl },
  back: { alignItems: 'flex-start', marginStart: -spacing.sm },
});
