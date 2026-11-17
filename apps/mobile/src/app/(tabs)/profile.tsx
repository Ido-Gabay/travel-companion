import {
  DISTANCE_UNITS,
  displayNameSchema,
  SUPPORTED_LOCALES,
  type DistanceUnit,
  type SupportedLocale,
} from '@travel-companion/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AppText,
  Button,
  ErrorState,
  InlineError,
  ListGroup,
  ListRow,
  LoadingState,
  Screen,
  ScreenHeader,
  Sheet,
  TextField,
  useActionMenu,
} from '@/components/ui';
import { signOut } from '@/features/auth/auth-actions';
import { getPendingState } from '@/features/offline/ops-store';
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
  const [editingName, setEditingName] = useState(false);
  const openMenu = useActionMenu();

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
      {
        onSuccess: () => {
          setJustSaved(true);
          setEditingName(false);
        },
      },
    );
  };

  const changeLocale = (next: SupportedLocale) => {
    setLocale(next);
    updatePreferences.mutate({ locale: next });
  };

  const changeDistance = (next: DistanceUnit) => {
    updatePreferences.mutate({ distanceUnit: next });
  };

  const distanceUnit = profile.preferences.distanceUnit;

  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} />

      <ListGroup>
        <ListRow
          title={profile.displayName ?? t('profile.displayNamePlaceholder')}
          subtitle={profile.email ?? undefined}
          leading={
            <View style={styles.avatar}>
              <AppText variant="bodyStrong" color="onAccent" align="center">
                {initials(profile.displayName, profile.email)}
              </AppText>
            </View>
          }
          accessibilityHint={t('profile.editName')}
          onPress={() => {
            setName(savedName);
            setEditingName(true);
          }}
        />
      </ListGroup>
      {justSaved ? (
        <AppText variant="caption" color="secondary" accessibilityLiveRegion="polite">
          {t('profile.saved')}
        </AppText>
      ) : null}

      <ListGroup title={t('profile.preferences')}>
        <ListRow
          title={t('profile.language')}
          leading="language-outline"
          value={t(`languages.${locale}`)}
          onPress={() =>
            openMenu({
              title: t('profile.language'),
              items: SUPPORTED_LOCALES.map((value) => ({
                label: value === locale ? `${t(`languages.${value}`)} ✓` : t(`languages.${value}`),
                onPress: () => value !== locale && changeLocale(value),
              })),
            })
          }
        />
        <ListRow
          title={t('profile.distanceUnit')}
          leading="resize-outline"
          value={t(`profile.${distanceUnit}`)}
          onPress={() =>
            openMenu({
              title: t('profile.distanceUnit'),
              items: DISTANCE_UNITS.map((value) => ({
                label: value === distanceUnit ? `${t(`profile.${value}`)} ✓` : t(`profile.${value}`),
                onPress: () => value !== distanceUnit && changeDistance(value),
              })),
            })
          }
        />
        <ListRow
          title={t('reminders.title')}
          leading="notifications-outline"
          onPress={() => router.push('/settings/reminders')}
        />
      </ListGroup>
      {updatePreferences.isError ? <InlineError message={errorMessage(updatePreferences.error)} /> : null}

      <ListGroup title={t('profile.costs')}>
        <ListRow title={t('usage.title')} leading="speedometer-outline" onPress={() => router.push('/settings/usage')} />
      </ListGroup>

      <ListGroup>
        <ListRow
          title={signingOut ? t('common.loading') : t('profile.signOut')}
          leading="log-out-outline"
          destructive
          chevron={false}
          onPress={() => {
            if (signingOut) return;
            const doSignOut = () => {
              setSigningOut(true);
              void signOut().finally(() => setSigningOut(false));
            };
            // M12a: never drop unsynced changes without the user knowing.
            const { ops, conflicts } = getPendingState();
            const unsynced = ops.length + conflicts.length;
            if (unsynced === 0) {
              doSignOut();
              return;
            }
            Alert.alert(t('offline.signOutTitle'), t('offline.signOutBody', { count: unsynced }), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('offline.signOutAnyway'), style: 'destructive', onPress: doSignOut },
            ]);
          }}
        />
      </ListGroup>

      <Sheet
        visible={editingName}
        title={t('profile.displayName')}
        onClose={() => setEditingName(false)}
        footer={
          <Button
            label={t('common.save')}
            onPress={saveName}
            loading={updateProfile.isPending}
            disabled={!nameChanged || !nameValid}
          />
        }
      >
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
          onSubmitEditing={() => nameChanged && nameValid && saveName()}
        />
        {updateProfile.isError ? <InlineError message={errorMessage(updateProfile.error)} /> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
