import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface ActionMenuItem {
  label: string;
  icon?: IconName;
  onPress: () => void;
  destructive?: boolean;
  /** Hidden items are skipped, so callers can build lists with conditions inline. */
  hidden?: boolean;
}

export interface ActionMenuConfig {
  title?: string;
  subtitle?: string;
  items: ActionMenuItem[];
}

type Open = (config: ActionMenuConfig) => void;

const ActionMenuContext = createContext<Open | null>(null);

/**
 * One bottom action sheet for the whole app. Rows stay clean; every secondary action
 * for a thing (a stop, a place, a trip) lives here. Works the same on iOS and Android,
 * in RTL and LTR, with any number of items (unlike Alert on Android).
 */
export function ActionMenuProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const [config, setConfig] = useState<ActionMenuConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const open = useCallback<Open>((next) => {
    pending.current = null;
    setConfig(next);
    setVisible(true);
  }, []);

  const runPending = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);

  const choose = useCallback(
    (item: ActionMenuItem | null) => {
      pending.current = item ? item.onPress : null;
      setVisible(false);
      // iOS can't present another modal (sheet, alert) while this one is dismissing:
      // run the action from onDismiss there. Android has no onDismiss; run it now.
      if (Platform.OS !== 'ios') setTimeout(runPending, 0);
    },
    [runPending],
  );

  const items = (config?.items ?? []).filter((i) => !i.hidden);

  return (
    <ActionMenuContext.Provider value={open}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => choose(null)}
        onDismiss={runPending}
      >
        <View style={[styles.root, { direction }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={() => choose(null)}
          />
          <SafeAreaView edges={['bottom']} style={styles.panelWrap}>
            <View style={styles.panel}>
              {config?.title ? (
                <View style={styles.header}>
                  <AppText variant="heading" align="center" numberOfLines={2} accessibilityRole="header">
                    {config.title}
                  </AppText>
                  {config.subtitle ? (
                    <AppText variant="caption" color="secondary" align="center" numberOfLines={2}>
                      {config.subtitle}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              <ScrollView bounces={false} style={styles.scroll}>
                {items.map((item, i) => (
                  <Pressable
                    key={`${item.label}-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    onPress={() => choose(item)}
                    style={({ pressed }) => [
                      styles.item,
                      (i > 0 || !!config?.title) && styles.itemBorder,
                      pressed && styles.pressed,
                    ]}
                  >
                    {item.icon ? (
                      <Icon
                        name={item.icon}
                        size={20}
                        color={item.destructive ? colors.danger : colors.text}
                      />
                    ) : null}
                    <AppText
                      variant="body"
                      color={item.destructive ? 'danger' : 'primary'}
                      style={styles.itemLabel}
                    >
                      {item.label}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={() => choose(null)}
              style={({ pressed }) => [styles.panel, styles.cancel, pressed && styles.pressed]}
            >
              <AppText variant="bodyStrong" align="center">
                {t('common.cancel')}
              </AppText>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </ActionMenuContext.Provider>
  );
}

/** Returns `open(config)`. Must be inside ActionMenuProvider (mounted in the root layout). */
export function useActionMenu(): Open {
  const open = useContext(ActionMenuContext);
  if (!open) throw new Error('useActionMenu must be used inside ActionMenuProvider');
  return useMemo(() => open, [open]);
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,32,46,0.35)' },
  panelWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  panel: { backgroundColor: colors.surface, borderRadius: radii.card, overflow: 'hidden' },
  scroll: { maxHeight: 480 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xxs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemLabel: { flex: 1 },
  pressed: { backgroundColor: colors.surfaceMuted },
  cancel: { minHeight: 52, justifyContent: 'center', marginBottom: spacing.xs },
});
