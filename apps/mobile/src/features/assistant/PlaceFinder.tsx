import type { DiscoverResult, LatLng } from '@travel-companion/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { PlacesMap, type MapPoint } from '@/components/maps/PlacesMap';
import { AppText, Button, Icon, InlineError, TextField } from '@/components/ui';
import type { TravelMode } from '@/features/companion/travel';
import { useDiscoverSearch } from '@/features/discover/queries';
import { usePrimeGooglePlaces } from '@/features/places/queries';
import type { DayOption } from '@/features/planning/trip-plan';
import { LoadBar, Tag, type TagTone } from '@/features/planning/PlanParts';
import { dayTitle } from '@/features/trips/itinerary';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';
import { placeContext, placeSearchRequest, type FindPlace } from './place-finder';

const MAX_RESULTS = 5;

/**
 * D1 trip assistant · "I also want to visit …": search Google Maps (on tap),
 * pick the place, see where it is for this trip, and (when planning) which
 * day fits best and why. Nothing is saved or planned here; Apply does that.
 */
export function PlaceFinder({
  find,
  tripId,
  destination,
  visits,
  stay,
  nameOf,
  picked,
  onPick,
  planning,
  onPlan,
  days,
  chosenDay,
  onChooseDay,
  alreadyPlanned,
  hours,
  onCheckHours,
  onKeepInWishlist,
  keepingInWishlist,
  keptInWishlist,
  around = null,
  aroundLabel = null,
}: {
  find: FindPlace;
  tripId: string;
  destination: string | null;
  /** Planned visits with what the phone knows of their location. */
  visits: readonly { id: string; day: string; location: LatLng | null }[];
  stay: LatLng | null;
  nameOf: (id: string) => string;
  picked: DiscoverResult | null;
  onPick: (result: DiscoverResult | null) => void;
  planning: boolean;
  onPlan: () => void;
  days: DayOption[] | null;
  chosenDay: string | null;
  onChooseDay: (day: string, allowOver: boolean) => void;
  alreadyPlanned: string | null;
  hours: 'idle' | 'pending' | 'checked' | 'unknown';
  onCheckHours: () => void;
  onKeepInWishlist: () => void;
  keepingInWishlist: boolean;
  keptInWishlist: boolean;
  /** Search around this point (where the user is, or a closed place). */
  around?: LatLng | null;
  aroundLabel?: string | null;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const search = useDiscoverSearch();
  const prime = usePrimeGooglePlaces();
  const [query, setQuery] = useState(find.query ?? '');
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const dayName = (day: string) => dayTitle(day, locale);
  const travel = (minutes: number, mode: TravelMode | null) =>
    mode === 'transit' ? t('placeFind.byTransit', { minutes }) : t('placeFind.onFoot', { minutes });

  const runSearch = () => {
    if (!query.trim()) return;
    onPick(null);
    search.mutate(placeSearchRequest(find, query, { tripId, destination, around, planned: visits.flatMap((visit) => (visit.location ? [visit.location] : [])) }), {
      onSuccess: (response) => {
        const found = response.results.filter((result) => result.businessStatus !== 'CLOSED_PERMANENTLY').slice(0, MAX_RESULTS);
        prime(found);
        setResults(found);
        // One clear match is the place; several ask "which one?".
        if (found.length === 1) onPick(found[0] ?? null);
      },
    });
  };

  const context = picked ? placeContext(picked.location, visits, stay) : null;
  const points: MapPoint[] = picked?.location
    ? [
        { id: picked.placeId, latitude: picked.location.latitude, longitude: picked.location.longitude, title: picked.name, label: '★' },
        ...visits.flatMap((visit) =>
          visit.location ? [{ id: visit.id, latitude: visit.location.latitude, longitude: visit.location.longitude, title: nameOf(visit.id) }] : [],
        ),
      ]
    : [];
  const where = aroundLabel ?? (find.nearPlanned || find.nearHere ? t('placeFind.nearPlanned') : find.area ? t('placeFind.inArea', { area: find.area }) : destination ? t('placeFind.inArea', { area: destination }) : null);
  const shown = (days ?? []).filter((option) => option.fit !== 'past');
  const anyFits = shown.some((option) => option.fit === 'fits');
  const selected = chosenDay ?? shown.find((option) => option.best)?.day ?? null;

  const dayTags = (option: DayOption): { label: string; tone: TagTone }[] => {
    if (option.fit === 'closed') return [{ label: t('placeFind.dayClosed'), tone: 'danger' }];
    const tags: ({ label: string; tone: TagTone } | null)[] = [
      option.best ? { label: t('placeFind.bestFit'), tone: 'accent' } : null,
      option.fit === 'full' ? { label: t('placeFind.dayFull'), tone: 'danger' } : null,
      option.nearest && option.nearest.minutes <= 20
        ? { label: t('placeFind.dayNear', { name: nameOf(option.nearest.id), travel: travel(option.nearest.minutes, option.nearest.mode) }), tone: 'neutral' }
        : option.loadBefore === 0 && option.stayMinutes !== null
          ? { label: t('placeFind.dayFromStay', { travel: travel(option.stayMinutes, null) }), tone: 'neutral' }
          : option.loadBefore === 0
            ? { label: t('placeFind.dayEmpty'), tone: 'neutral' }
            : null,
      option.extraTravel > 0 ? { label: t('placeFind.dayExtra', { minutes: option.extraTravel }), tone: 'neutral' } : null,
      option.hours === 'open' ? { label: t('placeFind.dayOpen'), tone: 'success' } : null,
    ];
    return tags.filter((tag): tag is { label: string; tone: TagTone } => tag !== null);
  };

  return (
    <View style={styles.box}>
      <TextField
        label={find.query ? t('placeFind.label') : t('placeFind.whichPlace')}
        placeholder={t('placeFind.placeholder')}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={runSearch}
        maxLength={100}
      />
      <View style={styles.row}>
        <AppText variant="caption" color="tertiary" style={styles.flex}>
          {where}
        </AppText>
        <Button
          label={t('placeFind.search')}
          icon="search"
          variant="secondary"
          size="sm"
          block={false}
          loading={search.isPending}
          disabled={!query.trim()}
          onPress={runSearch}
        />
      </View>
      {search.isError ? <InlineError message={errorMessage(search.error)} /> : null}

      {results && results.length === 0 ? (
        <AppText variant="caption" color="secondary">
          {t('placeFind.noResults')}
        </AppText>
      ) : null}
      {results && results.length > 1 && !picked ? (
        <View style={styles.list}>
          <AppText variant="bodyStrong">{t('placeFind.whichOne')}</AppText>
          {results.map((result) => (
              <Pressable
                key={result.placeId}
                accessibilityRole="radio"
                accessibilityState={{ selected: false }}
                accessibilityLabel={result.name}
                onPress={() => onPick(result)}
                style={({ pressed }) => [styles.result, pressed && styles.pressed]}
              >
                <Icon name="radio-button-off" size={18} color={colors.textTertiary} />
                <View style={styles.flex}>
                  <AppText variant="body" numberOfLines={1}>
                    {result.name}
                  </AppText>
                  <AppText variant="caption" color="secondary" numberOfLines={2}>
                    {[result.typeLabel, result.address, result.inTrip ? t('placeFind.inTrip') : result.savedPlaceId ? t('placeFind.saved') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
              </Pressable>
          ))}
          <GoogleAttribution inline align="start" />
        </View>
      ) : null}

      {picked ? (
        <View style={styles.list}>
          <View style={styles.row}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {picked.name}
            </AppText>
            {/* The other matches stay one tap away instead of filling the sheet. */}
            {results && results.length > 1 ? (
              <Button label={t('placeFind.change')} variant="ghost" size="sm" block={false} onPress={() => onPick(null)} />
            ) : null}
          </View>
          <AppText variant="caption" color="secondary">
            {[picked.typeLabel, picked.address].filter(Boolean).join(' · ')}
          </AppText>
          {points.length > 0 ? <PlacesMap points={points} selectedId={picked.placeId} height={170} /> : null}
          {context?.nearest.map((near) => (
            <AppText key={near.id} variant="caption" color="secondary">
              {t('placeFind.nearVisit', { travel: travel(near.minutes, near.mode), name: nameOf(near.id), day: dayName(near.day) })}
            </AppText>
          ))}
          {context?.stay ? (
            <AppText variant="caption" color="secondary">
              {t('placeFind.fromStay', { travel: travel(context.stay.minutes, context.stay.mode) })}
            </AppText>
          ) : null}
          {!picked.location ? (
            <AppText variant="caption" color="tertiary">
              {t('placeFind.noLocation')}
            </AppText>
          ) : null}
          <GoogleAttribution inline align="start" />

          {alreadyPlanned ? (
            <AppText variant="caption" color="accent">
              {t('placeFind.alreadyPlanned', { day: dayName(alreadyPlanned) })}
            </AppText>
          ) : !planning ? (
            <Button label={t('placeFind.planIt')} icon="calendar-outline" variant="secondary" size="sm" block={false} onPress={onPlan} />
          ) : null}
        </View>
      ) : null}

      {picked && planning && !alreadyPlanned && days ? (
        <View style={styles.list}>
          <View style={styles.row}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {t('placeFind.whichDay')}
            </AppText>
            {hours === 'idle' ? (
              <Button label={t('placeFind.checkHours')} variant="ghost" size="sm" block={false} onPress={onCheckHours} />
            ) : hours === 'checked' ? (
              <Tag label={t('placeFind.hoursCheckedTag')} tone="success" />
            ) : null}
          </View>
          {hours === 'pending' || hours === 'unknown' ? (
            <AppText variant="caption" color="tertiary">
              {hours === 'pending' ? t('planning.checkingHours') : t('placeFind.hoursUnknown')}
            </AppText>
          ) : null}
          {shown.length === 0 ? (
            <AppText variant="caption" color="secondary">
              {t('placeFind.noDays')}
            </AppText>
          ) : null}
          {shown.map((option) => {
            const on = option.day === selected;
            return (
              <Pressable
                key={option.day}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={dayName(option.day)}
                onPress={() => onChooseDay(option.day, option.fit !== 'fits')}
                disabled={option.fit === 'closed'}
                style={({ pressed }) => [styles.result, on && styles.resultOn, pressed && styles.pressed]}
              >
                <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? colors.accent : colors.textTertiary} />
                <View style={styles.dayText}>
                  <AppText variant="body">{dayName(option.day)}</AppText>
                  <View style={styles.tags}>
                    {dayTags(option).map((tag) => (
                      <Tag key={tag.label} label={tag.label} tone={tag.tone} />
                    ))}
                  </View>
                  {option.fit !== 'closed' && option.capacityMinutes > 0 ? (
                    <LoadBar usedMinutes={option.loadAfter} capacityMinutes={option.capacityMinutes} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {!anyFits && shown.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {t('placeFind.nothingFits')}
            </AppText>
          ) : null}
          {chosenDay && shown.find((option) => option.day === chosenDay)?.fit === 'full' ? (
            <AppText variant="caption" color="danger">
              {t('placeFind.overWarning')}
            </AppText>
          ) : null}
          {keptInWishlist ? (
            <AppText variant="caption" color="accent">
              {t('placeFind.keptInWishlist')}
            </AppText>
          ) : (
            <Button
              label={t('placeFind.keepInWishlist')}
              variant="ghost"
              size="sm"
              block={false}
              loading={keepingInWishlist}
              onPress={onKeepInWishlist}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.xs },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.card },
  dayText: { flex: 1, gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  resultOn: { backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
});
