import {
  DISTANCE_UNITS,
  displayNameSchema,
  SUPPORTED_LOCALES,
  type DistanceUnit,
  type SupportedLocale,
} from '@travel-companion/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  InlineError,
  LoadingState,
  Screen,
  ScreenHeader,
  Section,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { signOut } from '@/features/auth/auth-actions';
import { useMe, useUpdatePreferences, useUpdateProfile } from '@/features/me/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email || '?';
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { locale, setLocale } = useLocale();
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const updatePreferences = useUpdatePreferences();

  const [name, setName] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const savedName = me.data?.displayName ?? '';
  useEffect(() => setName(savedName), [savedName]);

  if (me.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('profile.title')} />
        <LoadingState />
      </Screen>
    );
  }
  if (me.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('profile.title')} />
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
        <Button label={t('profile.signOut')} variant="danger" onPress={() => void signOut()} />
      </Screen>
    );
  }

  const profile = me.data;
  const trimmed = name.trim();
  const nameValid = trimmed === '' || displayNameSchema.safeParse(trimmed).success;
  const nameChanged = trimmed !== savedName;

  const saveName = () => {
    setJustSaved(false);
    updateProfile.mutate(
      { displayName: trimmed === '' ? null : trimmed },
      { onSuccess: () => setJustSaved(true) },
    );
  };

  const changeLocale = (next: SupportedLocale) => {
    setLocale(next);
    updatePreferences.mutate({ locale: next });
  };

  const changeDistance = (next: DistanceUnit) => {
    updatePreferences.mutate({ distanceUnit: next });
  };

  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} />

      <Card>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <AppText variant="heading" color="onAccent" align="center">
              {initials(profile.displayName, profile.email)}
            </AppText>
          </View>
          <View style={styles.identityText}>
            <AppText variant="heading" numberOfLines={1}>
              {profile.displayName ?? t('profile.displayNamePlaceholder')}
            </AppText>
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {profile.email ?? ''}
            </AppText>
          </View>
        </View>
      </Card>

      <Section title={t('profile.account')}>
        <TextField
          label={t('profile.displayName')}
          placeholder={t('profile.displayNamePlaceholder')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setJustSaved(false);
          }}
          maxLength={80}
          autoComplete="name"
          returnKeyType="done"
        />
        {updateProfile.isError ? <InlineError message={errorMessage(updateProfile.error)} /> : null}
        <Button
          label={justSaved && !nameChanged ? t('profile.saved') : t('common.save')}
          variant="secondary"
          icon={justSaved && !nameChanged ? 'checkmark' : undefined}
          onPress={saveName}
          loading={updateProfile.isPending}
          disabled={!nameChanged || !nameValid}
        />
      </Section>

      <Section title={t('profile.preferences')}>
        <View style={styles.preference}>
          <AppText variant="body" color="secondary">
            {t('profile.language')}
          </AppText>
          <SegmentedControl
            accessibilityLabel={t('profile.language')}
            options={SUPPORTED_LOCALES.map((value) => ({ value, label: t(`languages.${value}`) }))}
            value={locale}
            onChange={changeLocale}
          />
        </View>
        <View style={styles.preference}>
          <AppText variant="body" color="secondary">
            {t('profile.distanceUnit')}
          </AppText>
          <SegmentedControl
            accessibilityLabel={t('profile.distanceUnit')}
            options={DISTANCE_UNITS.map((value) => ({ value, label: t(`profile.${value}`) }))}
            value={profile.preferences.distanceUnit}
            onChange={changeDistance}
            disabled={updatePreferences.isPending}
          />
        </View>
        {updatePreferences.isError ? (
          <InlineError message={errorMessage(updatePreferences.error)} />
        ) : null}
      </Section>

      <Section title={t('reminders.title')}>
        <Button
          label={t('reminders.title')}
          icon="notifications-outline"
          variant="secondary"
          onPress={() => router.push('/settings/reminders')}
        />
      </Section>

      <Section title={t('profile.costs')}>
        <Button
          label={t('usage.title')}
          icon="speedometer-outline"
          variant="secondary"
          onPress={() => router.push('/settings/usage')}
        />
      </Section>

      <Button
        label={t('profile.signOut')}
        variant="danger"
        icon="log-out-outline"
        loading={signingOut}
        onPress={() => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: spacing.xxs },
  preference: { gap: spacing.sm },
});
