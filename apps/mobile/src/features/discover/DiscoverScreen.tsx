import type {
  DiscoverResult,
  InterpretResponse,
  SearchPlan,
  Trip,
} from '@travel-companion/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
  NavHeader,
  SegmentedControl,
} from '@/components/ui';
import { useSaveGooglePlaces } from '@/features/places/queries';
import { useTrips } from '@/features/trips/queries';
import { upcomingTrips } from '@/features/trips/upcoming';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import { useDiscoverSearch, useInterpret } from './queries';
import { ResultCard } from './ResultCard';

type Phase = 'idle' | 'interpreting' | 'clarify' | 'searching' | 'results';
type ViewMode = 'list' | 'map';

interface Clarify {
  question: string;
  options: string[];
}

interface DiscoverScreenProps {
  /** Opened from a trip: results can be added to it. */
  tripId?: string;
  /** "modal" shows a close button (opened from a trip); "tab" is the Discover tab. */
  mode: 'tab' | 'modal';
}

const SUGGESTION_KEYS = ['suggestion1', 'suggestion2', 'suggestion3', 'suggestion4', 'suggestion5', 'suggestion6'] as const;

/**
 * Natural-language place discovery: the AI turns the request into a Google
 * search (or asks one question), Google returns real places, the user picks
 * which ones to save to their collection and, optionally, a trip.
 */
export function DiscoverScreen({ tripId: initialTripId, mode }: DiscoverScreenProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const errorMessage = useErrorMessage();
  const trips = useTrips();
  const interpret = useInterpret();
  const search = useDiscoverSearch();
  const save = useSaveGooglePlaces();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [clarify, setClarify] = useState<Clarify | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [interpretation, setInterpretation] = useState<Extract<InterpretResponse, { action: 'search' }> | null>(null);
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>('list');
  const [mapSelection, setMapSelection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Target trip: the one we were opened from, else the next upcoming trip.
  const tripOptions = useMemo(
    () => upcomingTrips(trips.data?.items ?? [], toIsoDate(new Date())),
    [trips.data],
  );
  const [tripId, setTripId] = useState<string | null>(initialTripId ?? null);
  const [tripChosen, setTripChosen] = useState(Boolean(initialTripId));
  useEffect(() => {
    if (!tripChosen && tripOptions[0]) setTripId(tripOptions[0].id);
  }, [tripChosen, tripOptions]);
  const targetTrip: Trip | undefined = (trips.data?.items ?? []).find((trip) => trip.id === tripId);

  const busy = phase === 'interpreting' || phase === 'searching';

  const runSearch = (plan: SearchPlan, summary: InterpretResponse & { action: 'search' }) => {
    setPhase('searching');
    setInterpretation(summary);
    search.mutate(
      { plan, ...(tripId ? { tripId } : {}) },
      {
        onSuccess: (response) => {
          setResults(response.results);
          setSelected(new Set());
          setMapSelection(null);
          setPhase('results');
        },
        onError: (searchError) => {
          setError(errorMessage(searchError));
          setPhase(interpretation ? 'results' : 'idle');
        },
      },
    );
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
          runSearch(response.plan, response);
        },
        onError: (interpretError) => {
          setError(errorMessage(interpretError));
          setPhase('idle');
        },
      },
    );
  };

  const submit = (text = query) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setAnswers([]);
    setResults([]);
    setInterpretation(null);
    runInterpret(trimmed, []);
  };

  const answer = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !clarify) return;
    const next = [...answers, { question: clarify.question, answer: trimmed }];
    setAnswers(next);
    runInterpret(submittedQuery, next);
  };

  const toggleOpenNow = () => {
    if (!interpretation || busy) return;
    const plan = { ...interpretation.plan, openNow: !interpretation.plan.openNow };
    runSearch(plan, { ...interpretation, plan });
  };

  const isSaved = (result: DiscoverResult) =>
    result.savedPlaceId !== null && (tripId === null || result.inTrip);

  const toggle = (placeId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const saveSelected = () => {
    if (!interpretation || selected.size === 0) return;
    const ids = [...selected];
    setError(null);
    save.mutate(
      {
        items: ids.map((googlePlaceId) => ({ googlePlaceId, category: interpretation.plan.category })),
        ...(tripId ? { tripId } : {}),
      },
      {
        onSuccess: ({ places }) => {
          const byGoogleId = new Map(places.map((place) => [place.googlePlaceId, place.id]));
          setResults((current) =>
            current.map((result) =>
              byGoogleId.has(result.placeId)
                ? { ...result, savedPlaceId: byGoogleId.get(result.placeId) ?? null, inTrip: tripId !== null || result.inTrip }
                : result,
            ),
          );
          setSelected(new Set());
          setSavedMessage(
            targetTrip
              ? t('discover.savedToTrip', { count: ids.length, trip: targetTrip.title })
              : t('discover.savedToCollection', { count: ids.length }),
          );
        },
        onError: (saveError) => setError(errorMessage(saveError)),
      },
    );
  };

  const reset = () => {
    setPhase('idle');
    setQuery('');
    setResults([]);
    setInterpretation(null);
    setClarify(null);
    setSelected(new Set());
    setError(null);
    setSavedMessage(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const mapPoints = results
    .filter((result) => result.location)
    .map((result) => ({
      id: result.placeId,
      latitude: result.location?.latitude ?? 0,
      longitude: result.location?.longitude ?? 0,
      title: result.name,
    }));
  const mapResult = results.find((result) => result.placeId === mapSelection) ?? null;
  const savedLabel = tripId ? t('discover.inTrip') : t('discover.inCollection');

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
              <AppText variant="body" color="secondary">
                {t('discover.subtitle')}
              </AppText>
            </View>
          ) : null}

          {/* Search box */}
          <View style={styles.searchBox}>
            <Icon name="sparkles-outline" size={20} color={colors.accent} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t('discover.placeholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
              multiline
              maxLength={300}
              returnKeyType="search"
              blurOnSubmit
              onSubmitEditing={() => submit()}
              editable={!busy}
              accessibilityLabel={t('discover.placeholder')}
            />
            {phase !== 'idle' && !busy ? (
              <IconButton icon="close" accessibilityLabel={t('common.clear')} onPress={reset} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('discover.search')}
              disabled={!query.trim() || busy}
              onPress={() => submit()}
              style={[styles.go, (!query.trim() || busy) && styles.goDisabled]}
            >
              {busy ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Icon name="arrow-forward" size={20} color={colors.textOnAccent} flipInRtl />
              )}
            </Pressable>
          </View>

          {/* Trip target */}
          {(trips.data?.items.length ?? 0) > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripRow}>
              <AppText variant="caption" color="secondary">
                {t('discover.addTo')}
              </AppText>
              {[{ id: null as string | null, title: t('discover.collectionOnly') }, ...tripOptions.map((trip) => ({ id: trip.id as string | null, title: trip.title }))].map(
                (option) => {
                  const active = option.id === tripId;
                  return (
                    <Pressable
                      key={option.id ?? 'none'}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setTripChosen(true);
                        setTripId(option.id);
                      }}
                      style={[styles.tripChip, active && styles.tripChipActive]}
                    >
                      {option.id ? (
                        <Icon name="airplane-outline" size={13} color={active ? colors.textOnAccent : colors.textSecondary} flipInRtl />
                      ) : null}
                      <AppText variant="caption" style={[styles.tripChipText, active && styles.tripChipTextActive]}>
                        {option.title}
                      </AppText>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
          ) : null}

          {error ? <InlineError message={error} /> : null}

          {/* Idle: suggestions */}
          {phase === 'idle' ? (
            <View style={styles.suggestions}>
              <AppText variant="overline" color="tertiary">
                {t('discover.tryThese').toUpperCase()}
              </AppText>
              {SUGGESTION_KEYS.map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => submit(t(`discover.${key}`))}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                >
                  <Icon name="search-outline" size={16} color={colors.textTertiary} />
                  <AppText variant="body" style={styles.flex}>
                    {t(`discover.${key}`)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Working */}
          {busy ? (
            <View style={styles.steps}>
              <Step label={t('discover.stepUnderstand')} state={phase === 'interpreting' ? 'active' : 'done'} />
              <Step label={t('discover.stepSearch')} state={phase === 'searching' ? 'active' : 'pending'} />
            </View>
          ) : null}

          {/* Clarification */}
          {phase === 'clarify' && clarify ? (
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
          {phase === 'results' && interpretation ? (
            <View style={styles.results}>
              <View style={styles.interpretation}>
                <View style={styles.flex}>
                  <AppText variant="caption" color="tertiary">
                    {interpretation.interpretedBy === 'ai' ? t('discover.understoodAs') : t('discover.searchedFor')}
                  </AppText>
                  <AppText variant="bodyStrong">{interpretation.summary}</AppText>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: interpretation.plan.openNow }}
                  onPress={toggleOpenNow}
                  style={[styles.openNow, interpretation.plan.openNow && styles.openNowOn]}
                >
                  <Icon name="time-outline" size={14} color={interpretation.plan.openNow ? colors.textOnAccent : colors.textSecondary} />
                  <AppText variant="caption" style={[styles.openNowText, interpretation.plan.openNow && styles.openNowTextOn]}>
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
                    <View style={styles.toggle}>
                      <SegmentedControl
                        accessibilityLabel={t('discover.view')}
                        options={[
                          { value: 'list', label: t('discover.list') },
                          { value: 'map', label: t('discover.map') },
                        ]}
                        value={view}
                        onChange={setView}
                      />
                    </View>
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
                          onToggle={() => toggle(result.placeId)}
                        />
                      ))}
                    </>
                  ) : (
                    <View style={styles.mapWrap}>
                      <PlacesMap points={mapPoints} selectedId={mapSelection} onSelect={setMapSelection} height={380} />
                      {mapResult ? (
                        <ResultCard
                          result={mapResult}
                          selected={selected.has(mapResult.placeId)}
                          alreadySaved={isSaved(mapResult)}
                          savedLabel={savedLabel}
                          onToggle={() => toggle(mapResult.placeId)}
                        />
                      ) : (
                        <AppText variant="caption" color="secondary" align="center">
                          {t('discover.tapMarker')}
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
            <Button label={t('discover.save')} icon="bookmark" onPress={saveSelected} loading={save.isPending} block={false} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  content: { padding: spacing.xl, paddingBottom: 120, gap: spacing.lg },
  header: { gap: spacing.xs },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    paddingStart: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
    shadowColor: '#1F5C66',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  input: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: spacing.sm,
    color: colors.text,
  },
  go: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goDisabled: { opacity: 0.4 },
  tripRow: { alignItems: 'center', gap: spacing.sm },
  tripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tripChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tripChipText: { fontWeight: '600', color: colors.textSecondary },
  tripChipTextActive: { color: colors.textOnAccent },
  suggestions: { gap: spacing.sm, marginTop: spacing.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  suggestionPressed: { backgroundColor: colors.surfaceMuted },
  steps: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  interpretation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  openNowText: { fontWeight: '600', color: colors.textSecondary },
  openNowTextOn: { color: colors.textOnAccent },
  resultsHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggle: { width: 160 },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  mapWrap: { gap: spacing.md },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.success,
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
  },
});
