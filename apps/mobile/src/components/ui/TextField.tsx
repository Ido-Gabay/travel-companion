import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import { AppText } from './AppText';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Force LTR input (emails, passwords) even in a Hebrew UI. */
  ltr?: boolean;
}

/** Instance type of the input, for refs (e.g. to call .focus()). */
export type TextFieldHandle = ComponentRef<typeof TextInput>;

export const TextField = forwardRef<TextFieldHandle, TextFieldProps>(function TextField(
  { label, error, hint, ltr = false, onFocus, onBlur, ...inputProps },
  ref,
) {
  const { isRtl } = useLocale();
  const [focused, setFocused] = useState(false);
  const rtlText = isRtl && !ltr;

  return (
    <View style={styles.container}>
      <AppText variant="caption" color="secondary" style={styles.label}>
        {label}
      </AppText>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          inputProps.multiline ? styles.multiline : null,
          {
            textAlign: rtlText ? 'right' : 'left',
            writingDirection: rtlText ? 'rtl' : 'ltr',
            borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
          },
        ]}
      />
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="tertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontWeight: '600' },
  input: {
    ...typography.body,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
});
