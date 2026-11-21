import type { DiscoverResult, LatLng, SearchArea, SearchPlan, Trip } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { PlacesMap } from '@/components/maps/PlacesMap';
import {
  AppText,
  Button,
  Icon,
  IconButton,
  InlineError,
  ListGroup,
  ListRow,
  NavHeader,
} from '@/components/ui';
import { distanceMeters, formatDistance, type Bounds } from '@/features/companion/geo';
import { useCurrentLocation } from '@/features/companion/location';
import { useMe } from '@/features/me/queries';
import { useGooglePlace, usePrimeGooglePlaces, useSaveGooglePlaces } from '@/features/places/queries';
import { primaryStay, stayForNight } from '@/features/trips/model';
import { useTrip } from '@/features/trips/queries';
import { StaySheet } from '@/features/trips/StaySheet';
import { useTrips } from '@/features/trips/queries';
import { upcomingTrips } from '@/features/trips/upcoming';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, compactHitSlop, hitSlop, radii, shadows, spacing, typography, weights } from '@/theme/tokens';
import { ContextSheet } from './ContextSheet';
import { PlacePreviewSheet } from './PlacePreviewSheet';
import { useDiscoverSearch, useInterpret } from './queries';
import { ResultCard } from './ResultCard';
import {
  areaFor,
  defaultWhere,
  NEAR_HOTEL_RADIUS_M,
  SEARCH_PRESETS,
  whereOptions,
  type SearchPreset,
  type WhereKey,
} from './search-presets';

type Mode = 'search' | 'ai';
type Phase = 'idle' | 'interpreting' | 'clarify' | 'searching' | 'results';
type ViewMode = 'list' | 'map';

interface Clarify {
  question: string;
  options: string[];
}

/** What was searched last: rerun it for "Open now" or "Search this area". */
interface LastSearch {
  plan: SearchPlan;
  area: SearchArea | null;
  /** Shown above the results, e.g. "Coffee · Near my hotel" or the AI's summary. */
  label: string;
  source: 'google' | 'ai' | 'direct';
}

interface DiscoverScreenProps {
  /** Opened from a trip: results can be added to its wishlist. */
  tripId?: string;
  /** "modal" shows a close button (opened from a trip); "tab" is the Discover tab. */
  mode: 'tab' | 'modal';
  /** D1 trip assistant: a search the user asked for ("dinner near where I finish"), run once on open. */
  initialSearch?: { plan: SearchPlan; area: SearchArea; label: string };
}

const SUGGESTION_KEYS = ['suggestion1', 'suggestion2', 'suggestion3'] as const;

/**
 * Place discovery. Google Maps search is the standard way (type a name or
 * keyword, or tap a category, in an area); "Ask AI" is optional and turns a
 * request in your own words into a Google search. Either way the places are
 * real Google results, and the user chooses what to save to the collection
 * and, optionally, a trip's wishlist.
 */
export function DiscoverScreen({ tripId: initialTripId, mode, initialSearch }: DiscoverScreenProps) {
  const { t } = useTranslation();
  const { isRtl, locale } = useLocale();
  const errorMessage = useErrorMessage();
  const trips = useTrips();
  const interpret = useInterpret();
  const search = useDiscoverSearch();
  const save = useSaveGooglePlaces();
  const prime = usePrimeGooglePlaces();
  const location = useCurrentLocation();
  const distanceUnit = useMe().data?.preferences.distanceUnit ?? 'km';
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [searchMode, setSearchMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [submittedAiQuery, setSubmittedAiQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [clarify, setClarify] = useState<Clarify | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [last, setLast] = useState<LastSearch | null>(null);
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>('list');
  const [mapSelection, setMapSelection] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<Bounds | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationProblem, setLocationProblem] = useState<'denied' | 'unavailable' | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Target trip: the one we were opened from, else the next upcoming trip.
  const today = toIsoDate(new Date());
  const tripOptions = useMemo(() => upcomingTrips(trips.data?.items ?? [], today), [trips.data, today]);
  const [tripId, setTripId] = useState<string | null>(initialTripId ?? null);
  const [tripChosen, setTripChosen] = useState(Boolean(initialTripId));
  useEffect(() => {
    if (!tripChosen && tripOptions[0]) setTripId(tripOptions[0].id);
  }, [tripChosen, tripOptions]);
  const targetTrip: Trip | undefined = (trips.data?.items ?? []).find((trip) => trip.id === tripId);
  const duringTrip = Boolean(
    targetTrip?.startDate && targetTrip.endDate && targetTrip.startDate <= today && today <= targetTrip.endDate,
  );

  // Where to search. D1: the hotel is the stay for tonight (else the trip's main stay):
  // the user's own pin, or its Google place's real location.
  const tripView = useTrip(tripId ?? '');
  const stays = tripView.data?.stays ?? [];
  const stay = stayForNight(stays, today) ?? primaryStay(stays, targetTrip?.startDate ?? null);
  const hotelGoogleId = stay ? (stay.place?.googlePlaceId ?? null) : (targetTrip?.basePlaceId ?? null);
  const hotel = useGooglePlace(hotelGoogleId);
  const ownPin =
    stay?.place?.latitude != null && stay.place.longitude != null
      ? { latitude: stay.place.latitude, longitude: stay.place.longitude }
      : null;
  const hotelLocation: LatLng | null = ownPin ?? hotel.data?.location ?? null;
  const hasHotel = Boolean(stay?.place) || Boolean(!stay && targetTrip?.basePlaceId);
  const wheres = whereOptions(targetTrip ?? null);
  const [where, setWhere] = useState<WhereKey>('anywhere');
  const [whereChosen, setWhereChosen] = useState(false);
  useEffect(() => {
    if (!whereChosen) setWhere(defaultWhere(targetTrip ?? null, duringTrip));
  }, [whereChosen, targetTrip, duringTrip]);

  const busy = phase === 'interpreting' || phase === 'searching';

  const whereLabel = (key: WhereKey): string => {
    switch (key) {
      case 'hotel':
        return t('discover.whereHotel');
      case 'destination':
        return targetTrip?.destination ?? t('discover.whereAnywhere');
      case 'me':
        return t('discover.whereMe');
      case 'anywhere':
        return t('discover.whereAnywhere');
      case 'map':
        return t('discover.whereMap');
    }
  };

  // The assistant's search: the user tapped "Search near there", so it runs once.
  const ranInitial = useRef(false);
  useEffect(() => {
    if (!initialSearch || ranInitial.current) return;
    ranInitial.current = true;
    runSearch({ ...initialSearch, source: 'google' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  const runSearch = (next: LastSearch) => {
    setError(null);
    setSavedMessage(null);
    setPhase('searching');
    setMovedTo(null);
    search.mutate(
      { plan: next.plan, ...(tripId ? { tripId } : {}), ...(next.area ? { area: next.area } : {}) },
      {
        onSuccess: (response) => {
          prime(response.results);
          setLast(next);
          setResults(response.results);
          setSelected(new Set());
          setMapSelection(null);
          setPhase('results');
        },
        onError: (searchError) => {
          setError(errorMessage(searchError));
          setPhase(last ? 'results' : 'idle');
        },
      },
    );
  };

  /** The area for the current "where" choice; null if we must ask for something first. */
  const resolveArea = async (key: WhereKey): Promise<{ ok: true; area: SearchArea | null } | { ok: false }> => {
    setLocationProblem(null);
    if (key === 'me') {
      const here = await location.locate();
      if (!here.ok) {
        setLocationProblem(here.reason);
        return { ok: false };
      }
      return { ok: true, area: areaFor('me', targetTrip ?? null, { here: here.coords, hotel: null }) };
    }
    if (key === 'hotel') {
      if (!hasHotel) {
        setPinOpen(true);
        return { ok: false };
      }
      if (!hotelLocation) {
        setError(t('discover.hotelLoading'));
        return { ok: false };
      }
    }
    return { ok: true, area: areaFor(key, targetTrip ?? null, { here: null, hotel: hotelLocation }) };
  };

  /** Standard Google search: what the user typed, or a category chip. No AI. */
  const runStandard = async (text: string, preset?: SearchPreset) => {
    const typed = text.trim();
    if (!typed && !preset) return;
    const resolved = await resolveArea(where);
    if (!resolved.ok) return;
    const label = preset ? t(`discover.preset.${preset.key}`) : typed;
    runSearch({
      plan: {
        textQuery: preset && !typed ? preset.textQuery : typed || (preset?.textQuery ?? ''),
        includedType: preset?.includedType ?? null,
        openNow: last?.plan.openNow ?? false,
        category: preset?.category ?? 'other',
      },
      area: resolved.area,
      label: `${label} · ${whereLabel(where)}`,
      source: 'google',
    });
  };

  const pickPreset = (preset: SearchPreset) => {
    setQuery(t(`discover.preset.${preset.key}`));
    void runStandard('', preset);
  };

  const submitStandard = () => {
    const text = query.trim();
    if (!text || busy) return;
    // A chip label left in the box searches that chip again.
    const preset = SEARCH_PRESETS.find((item) => t(`discover.preset.${item.key}`) === text);
    void runStandard(preset ? '' : text, preset);
  };

  const runInterpret = (text: string, clarifications: { question: string; answer: string }[]) => {
    setError(null);
    setSavedMessage(null);
    setPhase('interpreting');
    interpret.mutate(
      { query: text, ...(tripId ? { tripId } : {}), ...(clarifications.length ? { clarifications } : {}) },
      {
        onSuccess: (response) => {
          if (response.action === 'clarify') {
            setClarify({ question: response.question, options: response.options });
            setAnswerText('');
            setPhase('clarify');
            return;
          }
          setClarify(null);
          // "Near my hotel": search around the pinned hotel, not just its name.
          const area: SearchArea | null =
            response.plan.nearBase && hotelLocation
              ? { kind: 'circle', center: hotelLocation, radiusMeters: NEAR_HOTEL_RADIUS_M }
              : null;
          runSearch({
            plan: response.plan,
            area,
            label: response.summary,
            source: response.interpretedBy === 'ai' ? 'ai' : 'direct',
          });
        },
        onError: (interpretError) => {
          setError(errorMessage(interpretError));
          setPhase('idle');
        },
      },
    );
  };

  const submitAi = (text = aiQuery) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setAiQuery(trimmed);
    setSubmittedAiQuery(trimmed);
    setAnswers([]);
    runInterpret(trimmed, []);
  };

  const answer = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !clarify) return;
    const next = [...answers, { question: clarify.question, answer: trimmed }];
    setAnswers(next);
    runInterpret(submittedAiQuery, next);
  };

  const toggleOpenNow = () => {
    if (!last || busy) return;
    runSearch({ ...last, plan: { ...last.plan, openNow: !last.plan.openNow } });
  };

  const searchThisArea = () => {
    if (!last || !movedTo) return;
    const base = last.label.split(' · ')[0] ?? last.label;
    runSearch({
      ...last,
      area: { kind: 'bounds', low: movedTo.low, high: movedTo.high },
      label: `${base} · ${t('discover.whereMap')}`,
    });
  };

  const chooseWhere = (key: WhereKey) => {
    setWhereChosen(true);
    setWhere(key);
    setLocationProblem(null);
    if (key === 'hotel' && !hasHotel) setPinOpen(true);
  };

  const isSaved = (result: DiscoverResult) => result.savedPlaceId !== null && (tripId === null || result.inTrip);

  const toggle = (placeId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  /** Saves to the collection (deduplicated by Google place ID) and, if asked, the trip's wishlist. */
  const saveItems = (items: DiscoverResult[], toTrip: boolean) => {
    if (items.length === 0) return;
    const trip = toTrip ? targetTrip : undefined;
    setError(null);
    save.mutate(
      {
        items: items.map((result) => ({ googlePlaceId: result.placeId, category: result.category })),
        ...(trip ? { tripId: trip.id } : {}),
      },
      {
        onSuccess: ({ places }) => {
          const byGoogleId = new Map(places.map((place) => [place.googlePlaceId, place.id]));
          setResults((current) =>
            current.map((result) =>
              byGoogleId.has(result.placeId)
                ? { ...result, savedPlaceId: byGoogleId.get(result.placeId) ?? null, inTrip: Boolean(trip) || result.inTrip }
                : result,
            ),
          );
          setSelected((current) => {
            const next = new Set(current);
            for (const item of items) next.delete(item.placeId);
            return next;
          });
          setSavedMessage(
            trip
              ? t('discover.savedToTrip', { count: items.length, trip: trip.title })
              : t('discover.savedToCollection', { count: items.length }),
          );
        },
        onError: (saveError) => setError(errorMessage(saveError)),
      },
    );
  };

  const reset = () => {
    setPhase('idle');
    setQuery('');
    setAiQuery('');
    setResults([]);
    setLast(null);
    setClarify(null);
    setSelected(new Set());
    setError(null);
    setSavedMessage(null);
    setMovedTo(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const [contextOpen, setContextOpen] = useState(false);
  const hasTrips = (trips.data?.items.length ?? 0) > 0;
  const saveLabel = targetTrip
    ? t('discover.tripWishlist', { trip: targetTrip.title })
    : t('discover.collectionOnly');
  const contextLine = [
    searchMode === 'search' ? whereLabel(where) : null,
    hasTrips ? t('discover.savingTo', { target: saveLabel }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const switchMode = (next: Mode) => {
    if (next === searchMode) return;
    setSearchMode(next);
    if (phase === 'clarify' || phase === 'interpreting') setPhase(last ? 'results' : 'idle');
    setError(null);
  };

  // Distance from the search center when searching around the user or the hotel.
  const center = last?.area?.kind === 'circle' ? last.area.center : null;
  const distanceFor = (result: DiscoverResult) =>
    center && result.location ? formatDistance(distanceMeters(center, result.location), locale, distanceUnit) : null;

  const mapPoints = results.flatMap((result) =>
    result.location
      ? [{ id: result.placeId, latitude: result.location.latitude, longitude: result.location.longitude, title: result.name }]
      : [],
  );
  const mapResult = results.find((result) => result.placeId === mapSelection) ?? null;
  const previewResult = results.find((result) => result.placeId === previewId) ?? null;
  const savedLabel = tripId ? t('discover.inTrip') : t('discover.inCollection');
  const selectedResults = results.filter((result) => selected.has(result.placeId));

  return (
    <SafeAreaView style={styles.safe} edges={mode === 'modal' ? ['top', 'bottom'] : ['top']}>
      {mode === 'modal' ? <NavHeader title={t('discover.title')} mode="close" /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!(phase === 'results' && view === 'map')}
        >
          {mode === 'tab' ? (
            <View style={styles.header}>
              <AppText variant="display" accessibilityRole="header">
                {t('discover.title')}
              </AppText>
            </View>
          ) : null}

          {searchMode === 'ai' ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => switchMode('search')}
              style={styles.modeBack}
            >
              <Icon name="arrow-back" size={16} color={colors.accent} flipInRtl />
              <AppText variant="caption" color="accent" style={styles.bold}>
                {t('discover.backToSearch')}
              </AppText>
            </Pressable>
          ) : null}

          {/* Search box */}
          {searchMode === 'search' ? (
            <View style={styles.searchBox}>
              <Icon name="search" size={20} color={colors.textSecondary} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder={
                  targetTrip?.destination
                    ? t('discover.searchPlaceholderIn', { place: targetTrip.destination })
                    : t('discover.searchPlaceholder')
                }
                placeholderTextColor={colors.textTertiary}
                style={[styles.input, styles.inputSingle, { textAlign: isRtl ? 'right' : 'left' }]}
                maxLength={200}
                returnKeyType="search"
                onSubmitEditing={submitStandard}
                editable={!busy}
                accessibilityLabel={t('discover.searchPlaceholder')}
              />
              {busy ? <ActivityIndicator color={colors.accent} /> : null}
              {!busy && (query || phase !== 'idle') ? (
                <IconButton icon="close-circle" accessibilityLabel={t('common.clear')} onPress={reset} />
              ) : null}
              {!busy && !query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('discover.modeAi')}
                  onPress={() => switchMode('ai')}
                  style={({ pressed }) => [styles.aiPill, pressed && styles.pressed]}
                >
                  <Icon name="sparkles-outline" size={14} color={colors.accent} />
                  <AppText variant="caption" color="accent" style={styles.bold}>
                    {t('discover.askAi')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={[styles.searchBox, styles.aiBox]}>
              <Icon name="sparkles-outline" size={20} color={colors.accent} />
              <TextInput
                value={aiQuery}
                onChangeText={setAiQuery}
                placeholder={t('discover.placeholder')}
                placeholderTextColor={colors.textTertiary}
                style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
                multiline
                maxLength={300}
                returnKeyType="search"
                blurOnSubmit
                onSubmitEditing={() => submitAi()}
                editable={!busy}
                accessibilityLabel={t('discover.placeholder')}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('discover.search')}
                disabled={!aiQuery.trim() || busy}
                onPress={() => submitAi()}
                style={[styles.go, (!aiQuery.trim() || busy) && styles.goDisabled]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Icon name="arrow-forward" size={20} color={colors.textOnAccent} flipInRtl />
                )}
              </Pressable>
            </View>
          )}

          {/* Where to search + where saved places go: one line, one sheet */}
          {contextLine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={contextLine}
              accessibilityHint={t('discover.contextHint')}
              onPress={() => setContextOpen(true)}
              style={({ pressed }) => [styles.context, pressed && styles.pressed]}
            >
              <Icon
                name={searchMode === 'search' && where === 'hotel' ? 'bed-outline' : searchMode === 'search' && where === 'me' ? 'navigate-outline' : 'location-outline'}
                size={16}
                color={colors.textSecondary}
              />
              <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.flexShrink}>
                {contextLine}
              </AppText>
              <Icon name="chevron-down" size={14} color={colors.textSecondary} />
            </Pressable>
          ) : null}

          {error ? <InlineError message={error} /> : null}
          {locationProblem ? (
            <View style={styles.notice}>
              <Icon name="navigate-outline" size={18} color={colors.accent} />
              <AppText variant="body" style={styles.flex}>
                {locationProblem === 'denied' ? t('discover.locationDenied') : t('discover.locationUnavailable')}
              </AppText>
              {locationProblem === 'denied' ? (
                <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
                  <AppText variant="bodyStrong" color="accent">
                    {t('discover.openSettings')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {searchMode === 'search' && where === 'hotel' && targetTrip && !hasHotel ? (
            <Pressable accessibilityRole="button" onPress={() => setPinOpen(true)} style={styles.notice}>
              <Icon name="bed-outline" size={18} color={colors.accent} />
              <AppText variant="body" style={styles.flex}>
                {t('discover.pinHotelHint')}
              </AppText>
              <AppText variant="bodyStrong" color="accent">
                {t('hotelPin.pin')}
              </AppText>
            </Pressable>
          ) : null}

          {/* Categories (standard search): one row of chips */}
          {searchMode === 'search' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {SEARCH_PRESETS.map((preset) => (
                <Chip
                  key={preset.key}
                  label={t(`discover.preset.${preset.key}`)}
                  icon={preset.icon}
                  active={false}
                  onPress={() => pickPreset(preset)}
                />
              ))}
            </ScrollView>
          ) : null}

          {/* AI: suggestions */}
          {searchMode === 'ai' && phase === 'idle' ? (
            <ListGroup title={t('discover.tryThese')} footer={t('discover.aiPromoBody')}>
              {SUGGESTION_KEYS.map((key) => (
                <ListRow
                  key={key}
                  title={t(`discover.${key}`)}
                  numberOfLines={2}
                  chevron={false}
                  onPress={() => submitAi(t(`discover.${key}`))}
                />
              ))}
            </ListGroup>
          ) : null}

          {/* AI: working */}
          {searchMode === 'ai' && busy ? (
            <View style={styles.steps}>
              <Step label={t('discover.stepUnderstand')} state={phase === 'interpreting' ? 'active' : 'done'} />
              <Step label={t('discover.stepSearch')} state={phase === 'searching' ? 'active' : 'pending'} />
            </View>
          ) : null}

          {/* AI: clarification */}
          {searchMode === 'ai' && phase === 'clarify' && clarify ? (
            <View style={styles.clarify}>
              <View style={styles.clarifyHead}>
                <Icon name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
                <AppText variant="bodyStrong" style={styles.flex}>
                  {clarify.question}
                </AppText>
              </View>
              {clarify.options.length > 0 ? (
                <View style={styles.optionWrap}>
                  {clarify.options.map((option) => (
                    <Pressable key={option} accessibilityRole="button" onPress={() => answer(option)} style={styles.option}>
                      <AppText variant="bodyStrong" color="accent">
                        {option}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.answerRow}>
                <TextInput
                  value={answerText}
                  onChangeText={setAnswerText}
                  placeholder={t('discover.answerPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.answerInput, { textAlign: isRtl ? 'right' : 'left' }]}
                  returnKeyType="send"
                  onSubmitEditing={() => answer(answerText)}
                />
                <IconButton icon="arrow-forward" variant="filled" flipInRtl accessibilityLabel={t('discover.search')} onPress={() => answer(answerText)} />
              </View>
            </View>
          ) : null}

          {/* Results */}
          {last && (phase === 'results' || (phase === 'searching' && results.length > 0)) ? (
            <View style={[styles.results, phase === 'searching' && styles.dim]}>
              <View style={styles.summary}>
                <View style={styles.flex}>
                  <AppText variant="caption" color="tertiary">
                    {last.source === 'ai' ? t('discover.understoodAs') : t('discover.searchedFor')}
                  </AppText>
                  <AppText variant="bodyStrong">{last.label}</AppText>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: last.plan.openNow }}
                  onPress={toggleOpenNow}
                  hitSlop={hitSlop}
                  style={[styles.openNow, last.plan.openNow && styles.openNowOn]}
                >
                  <Icon name="time-outline" size={14} color={last.plan.openNow ? colors.textOnAccent : colors.textSecondary} />
                  <AppText variant="caption" style={[styles.openNowText, last.plan.openNow && styles.openNowTextOn]}>
                    {t('discover.openNow')}
                  </AppText>
                </Pressable>
              </View>

              {results.length === 0 ? (
                <View style={styles.empty}>
                  <Icon name="search-outline" size={26} color={colors.textTertiary} />
                  <AppText variant="body" color="secondary" align="center">
                    {t('discover.noResults')}
                  </AppText>
                </View>
              ) : (
                <>
                  <View style={styles.resultsHead}>
                    <AppText variant="caption" color="secondary" style={styles.flex}>
                      {t('discover.resultCount', { count: results.length })}
                    </AppText>
                    <Button
                      label={view === 'list' ? t('discover.map') : t('discover.list')}
                      icon={view === 'list' ? 'map-outline' : 'list-outline'}
                      variant="ghost"
                      size="sm"
                      block={false}
                      onPress={() => setView(view === 'list' ? 'map' : 'list')}
                    />
                  </View>

                  {view === 'list' ? (
                    <>
                      <GoogleAttribution />
                      {results.map((result) => (
                        <ResultCard
                          key={result.placeId}
                          result={result}
                          selected={selected.has(result.placeId)}
                          alreadySaved={isSaved(result)}
                          savedLabel={savedLabel}
                          distance={distanceFor(result)}
                          onToggle={() => toggle(result.placeId)}
                          onOpen={() => setPreviewId(result.placeId)}
                        />
                      ))}
                    </>
                  ) : (
                    <View style={styles.mapWrap}>
                      <View>
                        <PlacesMap
                          points={mapPoints}
                          selectedId={mapSelection}
                          onSelect={setMapSelection}
                          height={400}
                          onUserMove={setMovedTo}
                          showsUserLocation={location.state.status === 'ready'}
                        />
                        {movedTo ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={searchThisArea}
                            disabled={busy}
                            style={({ pressed }) => [styles.searchArea, pressed && styles.pressed]}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                              <Icon name="refresh" size={16} color={colors.accent} />
                            )}
                            <AppText variant="caption" color="accent" style={styles.bold}>
                              {t('discover.searchThisArea')}
                            </AppText>
                          </Pressable>
                        ) : null}
                      </View>
                      {mapResult ? (
                        <ResultCard
                          result={mapResult}
                          selected={selected.has(mapResult.placeId)}
                          alreadySaved={isSaved(mapResult)}
                          savedLabel={savedLabel}
                          distance={distanceFor(mapResult)}
                          onToggle={() => toggle(mapResult.placeId)}
                          onOpen={() => setPreviewId(mapResult.placeId)}
                        />
                      ) : (
                        <AppText variant="caption" color="secondary" align="center">
                          {t('discover.tapMarkerOrMove')}
                        </AppText>
                      )}
                    </View>
                  )}
                </>
              )}

              {savedMessage ? (
                <View style={styles.savedBanner} accessibilityLiveRegion="polite">
                  <Icon name="checkmark-circle" size={18} color={colors.success} />
                  <AppText variant="bodyStrong" style={styles.flex}>
                    {savedMessage}
                  </AppText>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      targetTrip
                        ? router.push({ pathname: '/trips/[id]', params: { id: targetTrip.id } })
                        : router.navigate('/places')
                    }
                  >
                    <AppText variant="bodyStrong" color="accent">
                      {t('discover.view')}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Save bar */}
        {selected.size > 0 ? (
          <View style={styles.saveBar}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t('discover.selected', { count: selected.size })}</AppText>
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {targetTrip ? t('discover.toCollectionAndTrip', { trip: targetTrip.title }) : t('discover.toCollection')}
              </AppText>
            </View>
            <Button
              label={targetTrip ? t('discover.addToWishlist') : t('discover.save')}
              icon={targetTrip ? 'airplane-outline' : 'bookmark'}
              onPress={() => saveItems(selectedResults, Boolean(targetTrip))}
              loading={save.isPending}
              block={false}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <ContextSheet
        visible={contextOpen}
        onClose={() => setContextOpen(false)}
        wheres={searchMode === 'search' ? wheres : null}
        where={where}
        whereLabel={whereLabel}
        onWhere={chooseWhere}
        trips={hasTrips ? tripOptions : null}
        tripId={tripId}
        onTrip={(id) => {
          setTripChosen(true);
          setTripId(id);
        }}
      />
      <PlacePreviewSheet
        result={previewResult}
        trip={targetTrip}
        distance={previewResult ? distanceFor(previewResult) : null}
        saving={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onSaveToCollection={(result) => saveItems([result], false)}
        onAddToTrip={(result) => saveItems([result], true)}
        onOpenSaved={(placeId) => {
          setPreviewId(null);
          router.push({ pathname: '/places/[id]', params: { id: placeId } });
        }}
        onClose={() => setPreviewId(null)}
      />
      {tripView.data ? (
        <StaySheet
          trip={tripView.data}
          stay={stay}
          visible={pinOpen}
          onClose={() => setPinOpen(false)}
          onSaved={(saved) => {
            if (!saved.place) return;
            setWhereChosen(true);
            setWhere('hotel');
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: SearchPreset['icon'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={compactHitSlop}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} size={14} color={active ? colors.textOnAccent : colors.textSecondary} /> : null}
      <AppText variant="caption" numberOfLines={1} style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Step({ label, state }: { label: string; state: 'pending' | 'active' | 'done' }) {
  return (
    <View style={styles.step}>
      {state === 'active' ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Icon
          name={state === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={state === 'done' ? colors.success : colors.borderStrong}
        />
      )}
      <AppText variant="body" color={state === 'pending' ? 'tertiary' : 'primary'}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  bold: { fontWeight: weights.semibold },
  pressed: { opacity: 0.75 },
  dim: { opacity: 0.5 },
  content: { padding: spacing.xl, paddingBottom: 120, gap: spacing.lg },
  header: { gap: spacing.xs },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingStart: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  aiBox: { alignItems: 'flex-start', paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.accent },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  modeBack: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  context: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingHorizontal: spacing.xs },
  flexShrink: { flexShrink: 1 },
  input: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: spacing.sm,
    color: colors.text,
  },
  inputSingle: { paddingTop: 0, minHeight: 48 },
  go: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goDisabled: { opacity: 0.4 },
  chipRow: { alignItems: 'center', gap: spacing.sm, paddingVertical: compactHitSlop.top },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 240,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontWeight: weights.semibold, color: colors.textSecondary },
  chipTextActive: { color: colors.textOnAccent },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  steps: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  clarify: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  clarifyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  answerInput: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  results: { gap: spacing.md },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  openNow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  openNowOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  openNowText: { fontWeight: weights.semibold, color: colors.textSecondary },
  openNowTextOn: { color: colors.textOnAccent },
  resultsHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  mapWrap: { gap: spacing.md },
  searchArea: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.successSoft,
  },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadows.floating,
  },
});
