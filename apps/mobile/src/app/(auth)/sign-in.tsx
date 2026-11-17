import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, TextField, type TextFieldHandle } from '@/components/ui';
import { AuthActionError, signIn } from '@/features/auth/auth-actions';
import { isValidEmail, type AuthErrorKey } from '@/features/auth/auth-errors';
import { AuthForm } from '@/features/auth/AuthForm';
import { spacing } from '@/theme/tokens';

export default function SignInScreen() {
  const { t } = useTranslation();
  const passwordRef = useRef<TextFieldHandle>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setFormError(null);
    if (!isValidEmail(email)) {
      setEmailError(t('auth.invalidEmail'));
      return;
    }
    setEmailError(null);
    if (!password) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // The root layout switches to the tabs when the session appears.
    } catch (error) {
      setFormError(error instanceof AuthActionError ? error.key : 'errors.UNKNOWN');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthForm title={t('auth.signInTitle')}>
      <View style={styles.fields}>
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          error={emailError}
          ltr
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          ltr
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>

      {formError ? <InlineError message={t(formError)} /> : null}

      <View style={styles.actions}>
        <Button
          label={t('auth.signIn')}
          onPress={() => void submit()}
          loading={submitting}
          disabled={!email || !password}
        />
        <Button
          label={`${t('auth.noAccount')} ${t('auth.createAccount')}`}
          variant="ghost"
          onPress={() => router.replace('/sign-up')}
        />
      </View>
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.lg },
  actions: { gap: spacing.sm },
});
