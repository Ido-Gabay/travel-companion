import { Platform, StyleSheet, Text, View } from 'react-native';
import { spacing } from '@/theme/tokens';

/**
 * Required attribution for Google Places content shown outside a Google map
 * (lists, cards, previews). Google allows the text "Google Maps" instead of the
 * logo where space is limited, with these rules (Places API policies, checked
 * 2026-11-17): Roboto or a sans-serif fallback, regular weight (400), normal
 * letter spacing, #1F1F1F / #5E5E5E / white with 4.5:1 contrast, 12–16 sp, one
 * line, exact capitalization, never translated, placed at the top or bottom of
 * the same container. Use this component everywhere; don't restyle it.
 * The official logo (16–19 dp tall) needs Google's asset files: optional polish.
 */
const TEXT_SIZE = 12;
const MAX_SIZE = 16;

export function GoogleAttribution({ align = 'end', inline = false }: { align?: 'start' | 'end'; inline?: boolean }) {
  return (
    <View
      style={[
        styles.row,
        !inline && styles.padded,
        { justifyContent: align === 'end' ? 'flex-end' : 'flex-start' },
      ]}
    >
      <Text
        style={styles.text}
        accessibilityLabel="Google Maps"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SIZE / TEXT_SIZE}
        // Never mirrored or translated, also in Hebrew.
        testID="google-maps-attribution"
      >
        Google Maps
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  padded: { paddingVertical: spacing.xs },
  text: {
    fontSize: TEXT_SIZE,
    fontWeight: '400',
    letterSpacing: 0,
    color: '#5E5E5E',
    writingDirection: 'ltr',
    ...(Platform.OS === 'android' ? { fontFamily: 'Roboto' } : {}),
  },
});
