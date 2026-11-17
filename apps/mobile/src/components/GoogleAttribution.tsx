import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme/tokens';

/**
 * Required attribution when Google Places content is shown without a Google
 * map. Google's policy allows the text "Google Maps" where the logo doesn't
 * fit; it is never translated or restyled into something else.
 * TODO: swap for the official Google Maps logo asset (16–19dp tall).
 */
export function GoogleAttribution({ align = 'end' }: { align?: 'start' | 'end' }) {
  return (
    <View style={[styles.row, { justifyContent: align === 'end' ? 'flex-end' : 'flex-start' }]}>
      <Text style={styles.text} accessibilityLabel="Google Maps">
        Google Maps
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: spacing.xs },
  text: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, writingDirection: 'ltr' },
});
