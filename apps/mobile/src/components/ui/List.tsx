import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface ListGroupProps {
  children: ReactNode;
  /** Optional sentence-case label above the group. */
  title?: string;
  /** Optional caption below the group. */
  footer?: string;
}

/**
 * Inset grouped list (iOS Settings style): one flat white surface, rows separated by
 * hairlines. Use this instead of stacking cards for lists of things.
 */
export function ListGroup({ children, title, footer }: ListGroupProps) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.wrap}>
      {title ? (
        <AppText variant="label" color="secondary" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText variant="caption" color="tertiary" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading icon (tinted accent) or any node, e.g. a number badge or a time. */
  leading?: IconName | ReactNode;
  /** Trailing value text, shown in secondary color. */
  value?: string;
  /** Any trailing node (switch, icon button). Shown after the value. */
  trailing?: ReactNode;
  /** Show a disclosure chevron (default: true when onPress is set and no trailing node). */
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  /** Dim the title (e.g. a visited place). */
  muted?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  numberOfLines?: number;
  /** For choice lists: announced to screen readers (pair with a check as `trailing`). */
  selected?: boolean;
}

export function ListRow({
  title,
  subtitle,
  leading,
  value,
  trailing,
  chevron,
  onPress,
  onLongPress,
  destructive = false,
  muted = false,
  accessibilityLabel,
  accessibilityHint,
  numberOfLines = 1,
  selected,
}: ListRowProps) {
  const showChevron = chevron ?? (!!onPress && !trailing);
  const lead =
    typeof leading === 'string' ? (
      <View style={styles.leadingIcon}>
        <Icon name={leading as IconName} size={20} color={destructive ? colors.danger : colors.accent} />
      </View>
    ) : (
      leading ?? null
    );

  const body = (
    <>
      {lead}
      <View style={styles.text}>
        <AppText
          variant="body"
          color={destructive ? 'danger' : muted ? 'tertiary' : 'primary'}
          numberOfLines={numberOfLines}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="body" color="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {showChevron ? <Icon name="chevron-forward" size={18} color={colors.textTertiary} flipInRtl /> : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return (
      <View style={styles.row} accessible={!trailing} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.xs },
  footer: { paddingHorizontal: spacing.xs },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginStart: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  leadingIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xxs },
  value: { maxWidth: '45%' },
});
