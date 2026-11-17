import { displayNameSchema } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, InlineError, TextField, type TextFieldHandle } from '@/components/ui';
import { AuthActionError, signUp } from '@/features/auth/auth-actions';
import { isValidEmail, PASSWORD_MIN, type AuthErrorKey } from '@/features/auth/auth-errors';
import { AuthForm } from '@/features/auth/AuthForm';
import { spacing } from '@/theme/tokens';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const emailRef = useRef<TextFieldHandle>(null);
  const passwordRef = useRef<TextFieldHandle>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmEmailFor, setConfirmEmailFor] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = t('auth.invalidEmail');
    if (password.length < PASSWORD_MIN) next.password = t('auth.passwordTooShort');
    setErrors(next);
    if (next.email || next.password) return;

    const parsedName = displayNameSchema.safeParse(name);
    setSubmitting(true);
    try {
      const result = await signUp(email.trim(), password, parsedName.success ? parsedName.data : null);
      if (result.status === 'confirm-email') setConfirmEmailFor(email.trim());
      // When signed in, the root layout switches to the tabs automatically.
    } catch (error) {
      setFormError(error instanceof AuthActionError ? error.key : 'errors.UNKNOWN');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmEmailFor) {
    return (
      <AuthForm title={t('auth.checkEmailTitle')}>
        <Card>
          <AppText variant="body">{t('auth.checkEmailBody', { email: confirmEmailFor })}</AppText>
        </Card>
        <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
      </AuthForm>
    );
  }

  return (
    <AuthForm title={t('auth.signUpTitle')}>
      <View style={styles.fields}>
        <TextField
          label={t('auth.displayName')}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          maxLength={80}
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          ref={emailRef}
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
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
          error={errors.password}
          hint={t('auth.passwordHint')}
          ltr
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>

      {formError ? <InlineError message={t(formError)} /> : null}

      <View style={styles.actions}>
        <Button
          label={t('auth.createAccount')}
          onPress={() => void submit()}
          loading={submitting}
          disabled={!email || !password}
        />
        <Button
          label={`${t('auth.haveAccount')} ${t('auth.signIn')}`}
          variant="ghost"
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.lg },
  actions: { gap: spacing.sm },
});
