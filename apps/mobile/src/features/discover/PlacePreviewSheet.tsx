import { googleMapsDirectionsUrl, googleMapsPlaceUrl, type DiscoverResult, type Trip } from '@travel-companion/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { googleMapsEnabled, PlacesMap } from '@/components/maps/PlacesMap';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet } from '@/components/ui';
import { CATEGORY_ICONS } from '@/features/places/categories';
import { GooglePhotoView } from '@/features/places/GooglePhotoView';
import { useGooglePlacePreview } from '@/features/places/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';

interface PlacePreviewSheetProps {
  /** The result to preview; null hides the sheet. */
  result: DiscoverResult | null;
  /** The trip whose wishlist "Add to trip" adds to (none: collection only). */
  trip: Trip | undefined;
  distance: string | null;
  saving: boolean;
  error: string | null;
  onSaveToCollection: (result: DiscoverResult) => void;
  onAddToTrip: (result: DiscoverResult) => void;
  onOpenSaved: (placeId: string) => void;
  onClose: () => void;
}

/** Extra photos a user can load on request (each one is billed by Google). */
const MORE_PHOTOS = 4;

/**
 * A Google result in detail before saving: photos, rating, opening hours,
 * address, category and map, with Save to collection / Add to trip wishlist.
 */
export function PlacePreviewSheet({
  result,
  trip,
  distance,
  saving,
  error,
  onSaveToCollection,
  onAddToTrip,
  onOpenSaved,
  onClose,
}: PlacePreviewSheetProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const preview = useGooglePlacePreview(result?.placeId ?? null);
  const [showMorePhotos, setShowMorePhotos] = useState(false);
  const [showHours, setShowHours] = useState(false);

  useEffect(() => {
    setShowMorePhotos(false);
    setShowHours(false);
  }, [result?.placeId]);

  if (!result) return null;

  const data = preview.data;
  const photos = data?.photos ?? [];
  const hero = photos[0];
  const extra = photos.slice(1, 1 + MORE_PHOTOS);
  const saved = result.savedPlaceId !== null;
  const inTrip = trip !== undefined && result.inTrip;
  const mapsUrl = result.googleMapsUri ?? googleMapsPlaceUrl(result.placeId, result.name);
  const directionsUrl = googleMapsDirectionsUrl(result.placeId, result.name);
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  const footer = (
    <>
      {error ? <InlineError message={error} /> : null}
      {saved ? (
        <View style={styles.savedRow}>
          <Icon name="checkmark-circle" size={20} color={colors.success} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {inTrip && trip ? t('preview.inCollectionAndTrip', { trip: trip.title }) : t('preview.inCollection')}
          </AppText>
        </View>
      ) : null}
      {trip && !inTrip ? (
        <Button
          label={t('preview.addToTrip', { trip: trip.title })}
          icon="airplane-outline"
          loading={saving}
          onPress={() => onAddToTrip(result)}
        />
      ) : null}
      {!saved ? (
        <Button
          label={t('preview.saveToCollection')}
          icon="bookmark-outline"
          variant={trip ? 'secondary' : 'primary'}
          loading={saving && !trip}
          onPress={() => onSaveToCollection(result)}
        />
      ) : result.savedPlaceId ? (
        <Button
          label={t('preview.openSaved')}
          icon="open-outline"
          variant="secondary"
          onPress={() => result.savedPlaceId && onOpenSaved(result.savedPlaceId)}
        />
      ) : null}
    </>
  );

  return (
    <Sheet visible title={result.name} subtitle={result.typeLabel ?? undefined} onClose={onClose} footer={footer}>
      {preview.isPending ? (
        <View style={[styles.heroPlaceholder, styles.center]}>
          <ActivityIndicator color={colors.textTertiary} />
        </View>
      ) : hero ? (
        <GooglePhotoView photo={hero} height={220} maxWidth={1200} />
      ) : null}

      {extra.length > 0 ? (
        showMorePhotos ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {extra.map((photo) => (
              <GooglePhotoView key={photo.name} photo={photo} height={120} maxWidth={400} style={styles.thumb} />
            ))}
          </ScrollView>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setShowMorePhotos(true)} style={styles.linkRow}>
            <Icon name="images-outline" size={16} color={colors.accent} />
            <AppText variant="caption" color="accent" style={styles.bold}>
              {t('preview.morePhotos', { count: extra.length })}
            </AppText>
          </Pressable>
        )
      ) : null}

      <View style={styles.facts}>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Icon name={CATEGORY_ICONS[result.category]} size={14} color={colors.accent} />
            <AppText variant="caption" color="accent" style={styles.bold}>
              {t(`categories.${result.category}`)}
            </AppText>
          </View>
          {data?.rating != null ? (
            <View style={styles.chip}>
              <Icon name="star" size={14} color="#E8A317" />
              <AppText variant="caption" style={styles.bold}>
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(data.rating)}
              </AppText>
              {data.userRatingCount != null ? (
                <AppText variant="caption" color="secondary">
                  ({new Intl.NumberFormat(locale).format(data.userRatingCount)})
                </AppText>
              ) : null}
            </View>
          ) : null}
          {data?.openNow != null ? (
            <View style={[styles.chip, data.openNow ? styles.openChip : styles.closedChip]}>
              <AppText variant="caption" style={[styles.bold, data.openNow ? styles.openText : styles.closedText]}>
                {data.openNow ? t('preview.openNow') : t('preview.closedNow')}
              </AppText>
            </View>
          ) : null}
          {distance ? (
            <View style={styles.chip}>
              <Icon name="walk-outline" size={14} color={colors.textSecondary} />
              <AppText variant="caption" color="secondary">
                {distance}
              </AppText>
            </View>
          ) : null}
        </View>

        {result.businessStatus === 'CLOSED_TEMPORARILY' ? (
          <AppText variant="bodyStrong" color="danger">
            {t('discover.temporarilyClosed')}
          </AppText>
        ) : null}

        {result.address ? (
          <View style={styles.line}>
            <Icon name="location-outline" size={18} color={colors.textSecondary} />
            <AppText variant="body" style={styles.flex}>
              {result.address}
            </AppText>
          </View>
        ) : null}

        {data && data.weekdayHours.length > 0 ? (
          <View>
            <Pressable accessibilityRole="button" onPress={() => setShowHours((value) => !value)} style={styles.line}>
              <Icon name="time-outline" size={18} color={colors.textSecondary} />
              <AppText variant="body" style={styles.flex}>
                {t('preview.hours')}
              </AppText>
              <Icon name={showHours ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
            </Pressable>
            {showHours ? (
              <View style={styles.hours}>
                {data.weekdayHours.map((line) => (
                  <AppText key={line} variant="caption" color="secondary">
                    {line}
                  </AppText>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {data?.detail === 'basic' ? (
          <AppText variant="caption" color="tertiary">
            {t('preview.basicOnly')}
          </AppText>
        ) : null}
      </View>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label={t('places.directions')} icon="navigate-outline" variant="secondary" onPress={() => open(directionsUrl)} />
        </View>
        <View style={styles.flex}>
          <Button label={t('places.openInGoogleMaps')} icon="map-outline" variant="secondary" onPress={() => open(mapsUrl)} />
        </View>
      </View>

      {googleMapsEnabled && result.location ? (
        <PlacesMap
          points={[{ id: result.placeId, latitude: result.location.latitude, longitude: result.location.longitude, title: result.name }]}
          height={180}
        />
      ) : null}

      <GoogleAttribution />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '600' },
  heroPlaceholder: { height: 220, borderRadius: radii.lg, backgroundColor: colors.surfaceMuted },
  photoRow: { gap: spacing.sm },
  thumb: { width: 160 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  facts: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  openChip: { backgroundColor: '#E6F2E9', borderColor: '#E6F2E9' },
  closedChip: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  openText: { color: colors.success },
  closedText: { color: colors.danger },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hours: { gap: spacing.xxs, paddingStart: spacing.xxl + spacing.xs, paddingTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
