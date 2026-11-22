import type { DiscoverResult, LatLng, PlaceCategory } from '@travel-companion/shared';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { googleMapsEnabled, PlacesMap, type MapPoint } from '@/components/maps/PlacesMap';
import { AppText, Button, Icon, InlineError, SegmentedControl, Sheet } from '@/components/ui';
import { useDiscoverSearch } from '@/features/discover/queries';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { primaryStay, type TripView } from '@/features/trips/model';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing, typography, weights } from '@/theme/tokens';
import { CATEGORY_ICONS } from './categories';
import { usePrimeGooglePlaces } from './queries';

const STAY_ID = 'stay';

/** The trip's main stay for the map, from what the phone already has (own pin or saved coordinates; never a lookup). */
export function useStayPin(trip: TripView | undefined): { location: LatLng; title: string } | null {
  const coordsFor = useOfflineCoords();
  if (!trip) return null;
  const stay = primaryStay(trip.stays, trip.startDate);
  const place = stay?.place ?? null;
  const own = place?.latitude != null && place.longitude != null ? { latitude: place.latitude, longitude: place.longitude } : null;
  const location = own ?? coordsFor(place?.googlePlaceId ?? trip.basePlaceId ?? null);
  return location ? { location, title: stay?.label ?? place?.myLabel ?? '' } : null;
}

/**
 * "Link to Google Maps" for a place saved by name (typed or imported): the
 * same search-and-pick as pinning a hotel. One Google search, only when the
 * user taps Search; picking a result hands it back (the caller saves it).
 * The map shows the same results by their returned coordinates (no extra call).
 */
export function GoogleLinkSheet({
  visible,
  name,
  query: initial,
  near,
  category,
  stay = null,
  busy = false,
  error = null,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The place being linked, as the user named it. */
  name: string;
  /** What to search for first (the name, plus an area the user gave). */
  query: string;
  /** The trip's destination, to search near. */
  near: string | null;
  category: PlaceCategory;
  /** Where the user stays, drawn on the map for reference (never a result). */
  stay?: { location: LatLng; title: string } | null;
  busy?: boolean;
  error?: string | null;
  onPick: (result: DiscoverResult) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const errorMessage = useErrorMessage();
  const search = useDiscoverSearch();
  const prime = usePrimeGooglePlaces();
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selected, setSelected] = useState<string | null>(null);

  const points = useMemo<MapPoint[]>(() => {
    const found = (results ?? []).flatMap((result, index) =>
      result.location
        ? [{ id: result.placeId, latitude: result.location.latitude, longitude: result.location.longitude, title: result.name, label: String(index + 1) }]
        : [],
    );
    return stay ? [...found, { id: STAY_ID, latitude: stay.location.latitude, longitude: stay.location.longitude, title: stay.title || t('googleLink.stayPin') }] : found;
  }, [results, stay, t]);
  const canMap = googleMapsEnabled && points.some((point) => point.id !== STAY_ID);

  const run = () => {
    const text = query.trim();
    if (!text) return;
    search.mutate(
      { plan: { textQuery: text, includedType: null, openNow: false, category }, ...(near ? { area: { kind: 'near', text: near } } : {}) },
      {
        onSuccess: (response) => {
          prime(response.results);
          setResults(response.results);
          setSelected(null);
        },
      },
    );
  };

  const row = (result: DiscoverResult, index: number, highlighted: boolean) => (
    <Pressable
      key={result.placeId}
      accessibilityRole="button"
      accessibilityLabel={result.name}
      accessibilityHint={t('googleLink.pickHint')}
      onPress={() => {
        setPicked(result.placeId);
        onPick(result);
      }}
      disabled={busy}
      style={({ pressed }) => [styles.result, highlighted && styles.resultOn, pressed && styles.pressed]}
    >
      <View style={styles.number}>
        <AppText variant="caption" color="onAccent" style={styles.bold}>
          {index + 1}
        </AppText>
      </View>
      <Icon name={CATEGORY_ICONS[result.category ?? category]} size={20} color={colors.accent} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {result.name}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={2}>
          {[result.typeLabel, result.address].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      {busy && picked === result.placeId ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <AppText variant="caption" color="accent" style={styles.bold}>
          {t('googleLink.pick')}
        </AppText>
      )}
    </Pressable>
  );
  const selectedIndex = results ? results.findIndex((result) => result.placeId === selected) : -1;
  const selectedResult = selectedIndex >= 0 ? results?.[selectedIndex] : undefined;

  return (
    <Sheet visible={visible} title={t('googleLink.title')} subtitle={name} onClose={onClose}>
      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('googleLink.placeholder')}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
          returnKeyType="search"
          onSubmitEditing={run}
          accessibilityLabel={t('googleLink.placeholder')}
        />
        {search.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
      <Button
        label={t('googleLink.search')}
        icon="search"
        variant="secondary"
        onPress={run}
        disabled={!query.trim() || search.isPending}
      />
      {results === null ? (
        <AppText variant="caption" color="tertiary">
          {t('googleLink.hint')}
        </AppText>
      ) : null}
      {search.isError ? <InlineError message={errorMessage(search.error)} /> : null}
      {error ? <InlineError message={error} /> : null}
      {results?.length === 0 ? (
        <AppText variant="body" color="secondary">
          {t('discover.noResults')}
        </AppText>
      ) : null}
      {results && results.length > 0 ? (
        <>
          {canMap ? (
            <SegmentedControl
              accessibilityLabel={t('googleLink.viewLabel')}
              options={[
                { value: 'list', label: t('googleLink.viewList') },
                { value: 'map', label: t('googleLink.viewMap') },
              ]}
              value={view}
              onChange={setView}
            />
          ) : null}
          <GoogleAttribution />
          {canMap && view === 'map' ? (
            <>
              <PlacesMap
                points={points}
                selectedId={selected}
                onSelect={(id) => setSelected(id === STAY_ID ? null : id)}
                height={260}
              />
              {selectedResult ? (
                row(selectedResult, selectedIndex, true)
              ) : (
                <AppText variant="caption" color="secondary">
                  {t('googleLink.mapHint')}
                </AppText>
              )}
            </>
          ) : (
            results.map((result, index) => row(result, index, result.placeId === selected))
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: weights.semibold },
  pressed: { opacity: 0.7 },
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
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  number: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
