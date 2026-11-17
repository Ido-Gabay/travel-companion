import type { DiscoverResult, Trip } from '@travel-companion/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet } from '@/components/ui';
import { useDiscoverSearch } from '@/features/discover/queries';
import { useGooglePlace, usePrimeGooglePlaces } from '@/features/places/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import { useUpdateTrip } from './queries';

interface HotelPinSheetProps {
  trip: Trip;
  visible: boolean;
  onClose: () => void;
  /** Called with the pinned place's location after saving, e.g. to run a search right away. */
  onPinned?: (placeId: string) => void;
}

/**
 * Pin where the user stays on Google Maps, so "near my hotel" uses its real
 * location. Only the place ID is saved on the trip; "Staying at" keeps the
 * user's own words.
 */
export function HotelPinSheet({ trip, visible, onClose, onPinned }: HotelPinSheetProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const errorMessage = useErrorMessage();
  const search = useDiscoverSearch();
  const update = useUpdateTrip(trip.id);
  const prime = usePrimeGooglePlaces();
  const pinned = useGooglePlace(trip.basePlaceId);
  const [query, setQuery] = useState(trip.baseLocation ?? '');
  const [results, setResults] = useState<DiscoverResult[] | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery(trip.baseLocation ?? '');
      setResults(null);
    }
  }, [visible, trip.baseLocation]);

  const run = () => {
    const text = query.trim();
    if (!text) return;
    search.mutate(
      {
        plan: { textQuery: text, includedType: null, openNow: false, category: 'stay' },
        ...(trip.destination ? { area: { kind: 'near', text: trip.destination } } : {}),
      },
      {
        onSuccess: (response) => {
          prime(response.results);
          setResults(response.results);
        },
      },
    );
  };

  const pin = (result: DiscoverResult) => {
    update.mutate(
      {
        basePlaceId: result.placeId,
        // Keep the user's own words; fill them in only if empty.
        ...(trip.baseLocation ? {} : { baseLocation: query.trim() || null }),
      },
      {
        onSuccess: () => {
          onPinned?.(result.placeId);
          onClose();
        },
      },
    );
  };

  return (
    <Sheet visible={visible} title={t('hotelPin.title')} subtitle={t('hotelPin.subtitle')} onClose={onClose}>
      {trip.basePlaceId ? (
        <View style={styles.current}>
          <Icon name="location" size={20} color={colors.accent} />
          <View style={styles.flex}>
            <AppText variant="caption" color="secondary">
              {t('hotelPin.pinnedNow')}
            </AppText>
            <AppText variant="bodyStrong">{pinned.data?.name ?? t('common.loading')}</AppText>
            {pinned.data?.address ? (
              <AppText variant="caption" color="secondary">
                {pinned.data.address}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => update.mutate({ basePlaceId: null })}
            hitSlop={8}
          >
            <AppText variant="caption" color="danger" style={styles.bold}>
              {t('hotelPin.remove')}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('hotelPin.placeholder')}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
          returnKeyType="search"
          onSubmitEditing={run}
          autoFocus={!trip.basePlaceId}
          accessibilityLabel={t('hotelPin.placeholder')}
        />
        {search.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
      <Button label={t('hotelPin.find')} icon="search" variant="secondary" onPress={run} disabled={!query.trim() || search.isPending} />

      {search.isError ? <InlineError message={errorMessage(search.error)} /> : null}
      {update.isError ? <InlineError message={errorMessage(update.error)} /> : null}

      {results?.length === 0 ? (
        <AppText variant="body" color="secondary">
          {t('discover.noResults')}
        </AppText>
      ) : null}
      {results && results.length > 0 ? (
        <>
          <GoogleAttribution />
          {results.map((result) => (
            <Pressable
              key={result.placeId}
              accessibilityRole="button"
              onPress={() => pin(result)}
              disabled={update.isPending}
              style={({ pressed }) => [styles.row, pressed && styles.pressed, result.placeId === trip.basePlaceId && styles.rowOn]}
            >
              <Icon name="bed-outline" size={20} color={colors.accent} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {result.name}
                </AppText>
                <AppText variant="caption" color="secondary" numberOfLines={2}>
                  {[result.typeLabel, result.address].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              {update.isPending && update.variables?.basePlaceId === result.placeId ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <AppText variant="caption" color="accent" style={styles.bold}>
                  {t('hotelPin.pin')}
                </AppText>
              )}
            </Pressable>
          ))}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { ...typography.body, flex: 1, minHeight: 48, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowOn: { borderColor: colors.accent },
});
