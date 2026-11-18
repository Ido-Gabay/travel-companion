import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type RefreshControlProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing } from '@/theme/tokens';

/**
 * A bottom sheet over a map, with three heights: collapsed (only the peek),
 * half and full. Built on React Native's own Animated and PanResponder, so it
 * needs no native module (no Reanimated or Gesture Handler).
 *
 * - Drag the handle or the peek to resize; a flick goes one step.
 * - Tap the handle to cycle; VoiceOver users swipe up/down on it (adjustable).
 * - With Reduce Motion on, it snaps without animating.
 * - Full height still leaves the top of the map visible: the map stays the workspace.
 */
export type SheetIndex = 0 | 1 | 2;

interface MapSheetProps {
  index: SheetIndex;
  onIndexChange: (index: SheetIndex) => void;
  /** Always visible at the top of the sheet (the next action). Its height sets the collapsed height. */
  peek: ReactNode;
  /** The scrollable rest (visible at half and full). */
  children: ReactNode;
  /** The visible sheet height after each change, for map padding and controls. */
  onHeightChange?: (height: number) => void;
  /** Spoken name of the sheet, e.g. "Day details". */
  accessibilityLabel: string;
  /** Spoken state names: [collapsed, half, full]. */
  stateLabels: [string, string, string];
  accessibilityHint?: string;
  refreshControl?: ReactElement<RefreshControlProps>;
}

const HANDLE_HEIGHT = 22;
/** Used until the peek has been measured (and in tests, where nothing is laid out). */
const DEFAULT_PEEK = 230;
const FLICK_VELOCITY = 0.5;

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduce(Boolean(value)))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value: boolean) => setReduce(value));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** The three heights for a window; pure so it's easy to reason about. */
export function sheetHeights(windowHeight: number, topInset: number, bottomInset: number, peekHeight: number) {
  const full = Math.round(windowHeight * 0.74);
  const half = Math.min(full, Math.round(windowHeight * 0.5));
  // Large text can make the peek tall: never above half, never under a usable minimum.
  const collapsed = Math.min(half, Math.max(140, HANDLE_HEIGHT + peekHeight + Math.max(bottomInset, spacing.sm)));
  return { heights: [collapsed, half, Math.max(half, Math.min(full, windowHeight - topInset - 72))] as const };
}

export function MapSheet({
  index,
  onIndexChange,
  peek,
  children,
  onHeightChange,
  accessibilityLabel,
  stateLabels,
  accessibilityHint,
  refreshControl,
}: MapSheetProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [peekHeight, setPeekHeight] = useState(DEFAULT_PEEK);
  const { heights } = useMemo(
    () => sheetHeights(window.height, insets.top, insets.bottom, peekHeight),
    [window.height, insets.top, insets.bottom, peekHeight],
  );
  const full = heights[2];
  const offsetFor = (i: SheetIndex) => full - heights[i];

  const translate = useRef(new Animated.Value(offsetFor(index))).current;
  const current = useRef(offsetFor(index));
  const live = useRef({ index, heights, onIndexChange });
  live.current = { index, heights, onIndexChange };

  // Move to the requested height (or the new heights after a layout change).
  useEffect(() => {
    const to = offsetFor(index);
    current.current = to;
    if (reduceMotion) {
      translate.setValue(to);
    } else {
      Animated.spring(translate, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    }
    onHeightChange?.(heights[index]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, heights, reduceMotion]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture too, so a vertical drag that starts on a button in the peek still moves the sheet.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => translate.stopAnimation(),
        onPanResponderMove: (_e, g) => {
          const [low, , high] = live.current.heights;
          const max = high - low;
          translate.setValue(Math.max(0, Math.min(max, current.current + g.dy)));
        },
        onPanResponderRelease: (_e, g) => {
          const { heights: hs, index: from, onIndexChange: change } = live.current;
          const fullH = hs[2];
          const visible = fullH - Math.max(0, Math.min(fullH - hs[0], current.current + g.dy));
          let target: SheetIndex;
          if (g.vy < -FLICK_VELOCITY) target = Math.min(2, from + 1) as SheetIndex;
          else if (g.vy > FLICK_VELOCITY) target = Math.max(0, from - 1) as SheetIndex;
          else {
            target = ([0, 1, 2] as const).reduce((best, i) =>
              Math.abs(hs[i] - visible) < Math.abs(hs[best] - visible) ? i : best,
            );
          }
          if (target === from) {
            Animated.spring(translate, { toValue: fullH - hs[from], useNativeDriver: true, bounciness: 0 }).start();
          } else {
            change(target);
          }
        },
      }),
    [translate],
  );

  const onPeekLayout = (event: LayoutChangeEvent) => {
    const h = Math.ceil(event.nativeEvent.layout.height);
    if (h > 0 && Math.abs(h - peekHeight) > 2) setPeekHeight(h);
  };

  return (
    <Animated.View
      style={[styles.sheet, { height: full, transform: [{ translateY: translate }] }]}
      testID="map-sheet"
    >
      <View {...pan.panHandlers}>
        <Pressable
          testID="map-sheet-handle"
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityValue={{ text: stateLabels[index] }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') onIndexChange(Math.min(2, index + 1) as SheetIndex);
            if (event.nativeEvent.actionName === 'decrement') onIndexChange(Math.max(0, index - 1) as SheetIndex);
          }}
          onPress={() => onIndexChange(((index + 1) % 3) as SheetIndex)}
          hitSlop={{ top: 10, bottom: 6, left: 40, right: 40 }}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </Pressable>
        <View onLayout={onPeekLayout}>{peek}</View>
      </View>
      <ScrollView
        scrollEnabled={index > 0}
        // Hidden from VoiceOver while collapsed, so focus stays on what's on screen.
        accessibilityElementsHidden={index === 0}
        importantForAccessibility={index === 0 ? 'no-hide-descendants' : 'auto'}
        contentContainerStyle={[styles.body, { paddingBottom: full - heights[index] + insets.bottom + spacing.xxl }]}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    ...shadows.floating,
  },
  handleArea: { height: HANDLE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 5, borderRadius: radii.pill, backgroundColor: colors.borderStrong },
  body: { paddingHorizontal: spacing.xl, gap: spacing.xl, paddingTop: spacing.sm },
});
