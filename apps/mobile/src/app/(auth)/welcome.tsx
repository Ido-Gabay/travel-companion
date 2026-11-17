import { SUPPORTED_LOCALES } from '@travel-companion/shared';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Icon, SegmentedControl } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={styles.language}>
          <SegmentedControl
            accessibilityLabel={t('profile.language')}
            options={SUPPORTED_LOCALES.map((value) => ({ value, label: t(`languages.${value}`) }))}
            value={locale}
            onChange={setLocale}
          />
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.mark}>
          <Icon name="compass-outline" size={34} color={colors.accent} />
        </View>
        <AppText variant="overline" color="accent">
          {t('common.appName').toUpperCase()}
        </AppText>
        <AppText variant="display">{t('auth.welcomeTitle')}</AppText>
        <AppText variant="body" color="secondary">
          {t('auth.welcomeBody')}
        </AppText>
      </View>

      <View style={styles.actions}>
        <Button label={t('auth.createAccount')} onPress={() => router.push('/sign-up')} />
        <Button label={t('auth.signIn')} variant="secondary" onPress={() => router.push('/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  top: { paddingTop: spacing.lg, alignItems: 'flex-end' },
  language: { width: 200 },
  hero: { flex: 1, justifyContent: 'center', gap: spacing.md },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  actions: { gap: spacing.md, paddingBottom: spacing.xl },
});
