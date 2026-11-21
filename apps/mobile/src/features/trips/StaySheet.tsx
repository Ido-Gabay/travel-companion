import type { DiscoverResult, LatLng, Place, Stay, TimeZoneSuggestion } from '@travel-companion/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet, TextField } from '@/components/ui';
import { useDiscoverSearch } from '@/features/discover/queries';
import { PinPicker } from '@/features/pins/PinPicker';
import { useCreatePlace, useGooglePlace, usePrimeGooglePlaces, useSaveGooglePlaces } from '@/features/places/queries';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useLocale } from '@/i18n/LocaleProvider';
import { api } from '@/lib/api';
import { formatTripDates } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing, typography, weights } from '@/theme/tokens';
import { DateField } from './DateField';
import type { TripView } from './model';
import { useRemoveStay, useSaveStay } from './queries';
import { TimeZoneNote } from './TimeZoneNote';

interface StaySheetProps {
  trip: TripView;
  /** The stay to edit, or null to add one. */
  stay: Stay | null;
  visible: boolean;
  onClose: () => void;
  /** After a stay is saved (e.g. Discover then searches near it). */
  onSaved?: (stay: Stay) => void;
}

type Mode = 'form' | 'search' | 'pin' | 'zone';

/**
 * D1 · One stay: the user's own words ("Staying at"), the hotel (a Google place
 * by ID, or the user's own pin), and the nights. After saving, a zone that
 * could be suggested is offered for one-tap confirmation; nothing derived from
 * Google data is stored without it (Q3).
 */
export function StaySheet({ trip, stay, visible, onClose, onSaved }: StaySheetProps) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const save = useSaveStay(trip.id);
  const remove = useRemoveStay(trip.id);
  const [mode, setMode] = useState<Mode>('form');
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [wholeTrip, setWholeTrip] = useState(true);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ stayId: string; zone: TimeZoneSuggestion } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const hotel = useGooglePlace(place?.source === 'google' ? place.googlePlaceId : null);

  useEffect(() => {
    if (!visible) return;
    setMode('form');
    setLabel(stay?.label ?? '');
    setPlace(stay?.place ?? null);
    setWholeTrip(!stay?.checkIn);
    setCheckIn(stay?.checkIn ?? trip.startDate);
    setCheckOut(stay?.checkOut ?? trip.endDate);
    setSuggestion(null);
    setFormError(null);
  }, [visible, stay, trip.startDate, trip.endDate]);

  /** Where the hotel is, only to suggest a zone: the user's own pin, or Google's location (memory only, never stored). */
  const location: LatLng | null =
    place?.latitude != null && place.longitude != null
      ? { latitude: place.latitude, longitude: place.longitude }
      : (hotel.data?.location ?? null);

  const submit = () => {
    const text = label.trim() || null;
    if (!text && !place) return setFormError(t('stays.needPlaceOrText'));
    if (!wholeTrip && (!checkIn || !checkOut || checkOut <= checkIn)) return setFormError(t('stays.datesInvalid'));
    setFormError(null);
    const nights = wholeTrip ? { checkIn: null, checkOut: null } : { checkIn, checkOut };
    save.mutate(
      {
        stayId: stay?.id ?? null,
        body: { label: text, placeId: place?.id ?? null, ...nights, ...(location ? { location } : {}) },
      },
      {
        onSuccess: (result) => {
          onSaved?.(result.stay);
          // Q3: a suggested zone is stored only after the user confirms it.
          if (result.timeZoneSuggestion?.timeZone && !result.stay.timeZone) {
            setSuggestion({ stayId: result.stay.id, zone: result.timeZoneSuggestion });
            setMode('zone');
          } else {
            onClose();
          }
        },
      },
    );
  };

  const confirmZone = (zone: string) => {
    if (!suggestion) return;
    save.mutate({ stayId: suggestion.stayId, body: { timeZone: zone } }, { onSuccess: onClose });
  };

  /** A stay saved earlier without a zone: suggest one now (nothing is stored until confirmed). */
  const suggestZone = async () => {
    if (!stay || !location) return;
    try {
      const zone = await api.lookupTimeZone(location.latitude, location.longitude);
      if (zone.timeZone) {
        setSuggestion({ stayId: stay.id, zone });
        setMode('zone');
      }
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const confirmRemove = () => {
    if (!stay) return;
    Alert.alert(t('stays.removeTitle'), t('stays.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('stays.remove'), style: 'destructive', onPress: () => remove.mutate(stay.id, { onSuccess: onClose }) },
    ]);
  };

  const title = mode === 'search' ? t('stays.findHotel') : mode === 'pin' ? t('stays.dropPin') : stay ? t('stays.edit') : t('stays.add');

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle={mode === 'form' ? t('stays.subtitle') : undefined}
      onClose={mode === 'form' || mode === 'zone' ? onClose : () => setMode('form')}
      scroll={mode !== 'pin'}
      footer={
        mode === 'form' ? (
          <Button label={t('common.save')} loading={save.isPending} onPress={submit} />
        ) : undefined
      }
    >
      {mode === 'search' ? (
        <HotelSearch
          query={label}
          near={trip.destination}
          onPick={(picked) => {
            setPlace(picked);
            setMode('form');
          }}
        />
      ) : mode === 'pin' ? (
        <OwnPin
          name={label.trim()}
          initial={place?.source === 'custom' && place.latitude != null && place.longitude != null ? { latitude: place.latitude, longitude: place.longitude } : null}
          onPlaced={(created) => {
            setPlace(created);
            setMode('form');
          }}
          onNeedName={() => {
            setMode('form');
            setFormError(t('stays.nameForPin'));
          }}
        />
      ) : mode === 'zone' && suggestion?.zone.timeZone ? (
        <View style={styles.zone}>
          <AppText variant="body">{t('stays.zoneQuestion')}</AppText>
          <Button label={t('stays.useZone', { zone: zoneName(suggestion.zone.timeZone) })} icon="time-outline" loading={save.isPending} onPress={() => confirmZone(suggestion.zone.timeZone!)} />
          {suggestion.zone.alternatives
            .filter((zone) => !zone.startsWith('Etc/'))
            .map((zone) => (
              <Button key={zone} label={t('stays.useZone', { zone: zoneName(zone) })} variant="secondary" onPress={() => confirmZone(zone)} />
            ))}
          <Button label={t('stays.notNow')} variant="ghost" onPress={onClose} />
          {!suggestion.zone.certain ? (
            <AppText variant="caption" color="secondary">
              {t('stays.zoneUncertain')}
            </AppText>
          ) : null}
          <TimeZoneNote />
          {save.isError ? <InlineError message={errorMessage(save.error)} /> : null}
        </View>
      ) : (
        <>
          <TextField
            label={t('stays.label')}
            placeholder={t('stays.labelPlaceholder')}
            hint={t('stays.labelHint')}
            value={label}
            onChangeText={setLabel}
            maxLength={200}
          />

          {place ? (
            <PinnedPlace place={place} onRemove={() => setPlace(null)} />
          ) : (
            <View style={styles.row}>
              <Button label={t('stays.findHotel')} icon="search" variant="secondary" size="sm" block={false} onPress={() => setMode('search')} />
              <Button label={t('stays.dropPin')} icon="location-outline" variant="ghost" size="sm" block={false} onPress={() => setMode('pin')} />
            </View>
          )}

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t('stays.wholeTrip')}</AppText>
              {/* The rule only matters once another stay shares the trip. */}
              {trip.stays.some((item) => item.id !== stay?.id) ? (
                <AppText variant="caption" color="secondary">
                  {t('stays.wholeTripHint')}
                </AppText>
              ) : null}
            </View>
            <Switch value={wholeTrip} onValueChange={setWholeTrip} accessibilityLabel={t('stays.wholeTrip')} />
          </View>
          {!wholeTrip ? (
            <>
              <DateField label={t('stays.checkIn')} value={checkIn} onChange={setCheckIn} />
              <DateField label={t('stays.checkOut')} value={checkOut} onChange={setCheckOut} minimumDate={checkIn} />
            </>
          ) : null}

          {stay ? (
            <View style={styles.zoneRow}>
              <Icon name="time-outline" size={18} color={colors.textSecondary} />
              <AppText variant="caption" color="secondary" style={styles.flex}>
                {stay.timeZone ? t('stays.zoneSet', { zone: zoneName(stay.timeZone) }) : t('stays.zoneNotSet')}
              </AppText>
              {!stay.timeZone && location ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void suggestZone()}>
                  <AppText variant="caption" color="accent" style={styles.bold}>
                    {t('stays.setZone')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {formError ? <InlineError message={formError} /> : null}
          {save.isError ? <InlineError message={errorMessage(save.error)} /> : null}
          {remove.isError ? <InlineError message={errorMessage(remove.error)} /> : null}
          {stay ? <Button label={t('stays.remove')} icon="trash-outline" variant="ghost" onPress={confirmRemove} /> : null}
        </>
      )}
    </Sheet>
  );
}

/** "America/New_York" → "New York". */
export function zoneName(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

/** Nights of a stay, or "Whole trip". */
export function stayNights(stay: Stay, locale: string, wholeTrip: string): string {
  return stay.checkIn && stay.checkOut ? (formatTripDates(stay.checkIn, stay.checkOut, locale) ?? wholeTrip) : wholeTrip;
}

function PinnedPlace({ place, onRemove }: { place: Place; onRemove: () => void }) {
  const { t } = useTranslation();
  const display = usePlaceDisplay(place);
  return (
    <View style={styles.pinned}>
      <Icon name={place.source === 'google' ? 'bed-outline' : 'location'} size={20} color={colors.accent} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {display.name}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={1}>
          {place.source === 'google' ? (display.address ?? t('stays.onGoogleMaps')) : t('stays.ownPin')}
        </AppText>
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onRemove}>
        <AppText variant="caption" color="danger" style={styles.bold}>
          {t('hotelPin.remove')}
        </AppText>
      </Pressable>
      {place.source === 'google' && display.google ? <GoogleAttribution inline /> : null}
    </View>
  );
}

/** Find the hotel on Google Maps; it is saved to the collection by place ID only (category "stay"). */
function HotelSearch({ query: initial, near, onPick }: { query: string; near: string | null; onPick: (place: Place) => void }) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const errorMessage = useErrorMessage();
  const search = useDiscoverSearch();
  const saveGoogle = useSaveGooglePlaces();
  const prime = usePrimeGooglePlaces();
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<DiscoverResult[] | null>(null);

  const run = () => {
    const text = query.trim();
    if (!text) return;
    search.mutate(
      { plan: { textQuery: text, includedType: null, openNow: false, category: 'stay' }, ...(near ? { area: { kind: 'near', text: near } } : {}) },
      {
        onSuccess: (response) => {
          prime(response.results);
          setResults(response.results);
        },
      },
    );
  };

  const pick = (result: DiscoverResult) =>
    saveGoogle.mutate(
      { items: [{ googlePlaceId: result.placeId, category: 'stay' }] },
      { onSuccess: (saved) => saved.places[0] && onPick(saved.places[0]) },
    );

  return (
    <>
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
          autoFocus
          accessibilityLabel={t('hotelPin.placeholder')}
        />
        {search.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
      <Button label={t('hotelPin.find')} icon="search" variant="secondary" onPress={run} disabled={!query.trim() || search.isPending} />
      {search.isError ? <InlineError message={errorMessage(search.error)} /> : null}
      {saveGoogle.isError ? <InlineError message={errorMessage(saveGoogle.error)} /> : null}
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
              onPress={() => pick(result)}
              disabled={saveGoogle.isPending}
              style={({ pressed }) => [styles.result, pressed && styles.pressed]}
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
              {saveGoogle.isPending ? <ActivityIndicator color={colors.accent} /> : (
                <AppText variant="caption" color="accent" style={styles.bold}>
                  {t('hotelPin.pin')}
                </AppText>
              )}
            </Pressable>
          ))}
        </>
      ) : null}
    </>
  );
}

/** The user's own pin for where they stay: a custom place (category "stay") they name and place. */
function OwnPin({
  name,
  initial,
  onPlaced,
  onNeedName,
}: {
  name: string;
  initial: LatLng | null;
  onPlaced: (place: Place) => void;
  onNeedName: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreatePlace();
  return (
    <View style={styles.flex}>
      <PinPicker
        initial={initial}
        confirmLabel={t('stays.usePin')}
        onPick={(point) => {
          if (!name) return onNeedName();
          create.mutate({ name: name.slice(0, 120), category: 'stay', ...point }, { onSuccess: onPlaced });
        }}
      />
      {create.isError ? <InlineError message={errorMessage(create.error)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: weights.semibold },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  zone: { gap: spacing.md },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pinned: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
});
