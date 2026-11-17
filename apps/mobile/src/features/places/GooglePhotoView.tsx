import type { GooglePhoto } from '@travel-companion/shared';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme/tokens';
import { useGooglePhoto } from './queries';

interface GooglePhotoViewProps {
  photo: GooglePhoto;
  height: number;
  maxWidth?: number;
  /** Show the photographer under the image (required by Google wherever the photo is shown). */
  showAttribution?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One Google photo. The image URL is fetched only when this view is shown
 * (each fetch is billed by Google and capped by the API) and never stored.
 */
export function GooglePhotoView({ photo, height, maxWidth = 800, showAttribution = true, style }: GooglePhotoViewProps) {
  const { t } = useTranslation();
  const media = useGooglePhoto(photo.name, maxWidth);
  const author = photo.attributions[0];

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.frame, { height }]}>
        {media.data ? (
          <Image source={{ uri: media.data.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : media.isError ? (
          <View style={styles.center}>
            <Icon name="image-outline" size={24} color={colors.textTertiary} />
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}
      </View>
      {showAttribution && author ? (
        <Pressable
          accessibilityRole={author.uri ? 'link' : 'text'}
          disabled={!author.uri}
          onPress={() => author.uri && void Linking.openURL(author.uri).catch(() => undefined)}
        >
          <AppText variant="caption" color="tertiary" numberOfLines={1}>
            {t('preview.photoBy', { name: author.displayName })}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs },
  frame: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
