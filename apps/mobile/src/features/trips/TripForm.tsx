import {
  createTripSchema,
  TRIP_BASE_LOCATION_MAX,
  TRIP_DESTINATION_MAX,
  TRIP_TITLE_MAX,
} from '@travel-companion/shared';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Icon, InlineError, TextField } from '@/components/ui';
import type { IconName } from '@/components/ui/Icon';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, compactHitSlop, hitSlop, radii, spacing, typography } from '@/theme/tokens';
import { tripLength, type DateRange } from './date-range';
import { DateRangePicker } from './DateRangePicker';
import { destinationLabel, findDestination, matchDestinations, type Destination } from './destinations';

export interface TripFormValues {
  title: string;
  destination: string | null;
  baseLocation: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface TripFormProps {
  initial?: TripFormValues;
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: TripFormValues) => void;
  /** "Staying at" (on create). D1: once the trip exists, stays are managed on the trip screen. */
  showBaseLocation?: boolean;
}

const utc = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));

/**
 * Where, when, where you stay, and a name. The destination and the dates sit on
 * one "ticket" at the top that fills in as you go; the calendar picks the whole
 * range; the name is suggested from the destination and month until you type
 * your own. Used to create and to edit trips; the primary action stays pinned
 * above the keyboard.
 */
export function TripForm({ initial, submitLabel, submitting, error, onSubmit, showBaseLocation = true }: TripFormProps) {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const [title, setTitle] = useState(initial?.title ?? '');
  // On create the name follows the destination until the user types one.
  const [titleTouched, setTitleTouched] = useState(Boolean(initial));
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [destinationFocused, setDestinationFocused] = useState(false);
  const [baseLocation, setBaseLocation] = useState(initial?.baseLocation ?? '');
  const [range, setRange] = useState<DateRange>({ start: initial?.startDate ?? null, end: initial?.endDate ?? null });
  const [titleError, setTitleError] = useState<string | null>(null);
  const destinationRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { start: startDate, end: endDate } = range;

  const listed = findDestination(destination);
  const suggestions = destinationFocused && !listed ? matchDestinations(destination) : [];
  const datesInvalid = startDate !== null && endDate !== null && endDate < startDate;
  const changed =
    !initial ||
    title.trim() !== initial.title ||
    (destination.trim() || null) !== initial.destination ||
    (baseLocation.trim() || null) !== initial.baseLocation ||
    startDate !== initial.startDate ||
    endDate !== initial.endDate;

  const suggestTitle = (place: string, start: string | null) => {
    if (titleTouched) return;
    const name = place.split(',')[0]?.trim() ?? '';
    if (!name) {
      setTitle('');
      return;
    }
    const month = start ? new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(utc(start)) : null;
    setTitle(month ? t('createTrip.autoTitle', { place: name, month }) : name);
    setTitleError(null);
  };

  const pickDestination = (item: Destination) => {
    const label = destinationLabel(item, locale);
    setDestination(label);
    suggestTitle(label, startDate);
    destinationRef.current?.blur();
  };

  const changeRange = (next: DateRange) => {
    setRange(next);
    suggestTitle(destination, next.start);
  };

  const submit = () => {
    const parsed = createTripSchema.safeParse({ title, destination, baseLocation, startDate, endDate });
    if (!parsed.success) {
      setTitleError(title.trim() ? null : t('createTrip.nameRequired'));
      return;
    }
    setTitleError(null);
    onSubmit(parsed.data);
  };

  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(iso));
  const days = startDate && endDate && !datesInvalid ? tripLength(startDate, endDate) : null;
  const neighborhoods = listed?.neighborhoods ?? [];
  const rtlText = { textAlign: isRtl ? ('right' as const) : ('left' as const), writingDirection: isRtl ? ('rtl' as const) : ('ltr' as const) };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {/* The ticket: where to, and when. */}
        <View style={styles.ticket} testID="trip-ticket">
          <View style={styles.ticketTop}>
            <View style={styles.row}>
              <Icon name="navigate-circle-outline" size={18} color={colors.accentSoft} />
              <AppText variant="label" style={styles.onTicketSoft}>
                {t('createTrip.whereTo')}
              </AppText>
            </View>
            <TextInput
              ref={destinationRef}
              value={destination}
              onChangeText={(value) => {
                setDestination(value);
                suggestTitle(value, startDate);
              }}
              onFocus={() => setDestinationFocused(true)}
              onBlur={() => setDestinationFocused(false)}
              placeholder={t('createTrip.destinationPlaceholder')}
              placeholderTextColor={colors.textOnAccentTertiary}
              accessibilityLabel={t('createTrip.destination')}
              accessibilityHint={t('createTrip.destinationHint')}
              maxLength={TRIP_DESTINATION_MAX}
              autoFocus={!initial}
              autoCorrect={false}
              returnKeyType="done"
              selectionColor={colors.textOnAccent}
              style={[styles.destinationInput, rtlText]}
            />
          </View>
          <View style={styles.perforation} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={[styles.notch, styles.notchStart]} />
            <View style={styles.dashes} />
            <View style={[styles.notch, styles.notchEnd]} />
          </View>
          <View style={styles.ticketBottom}>
            <TicketDate label={t('createTrip.startDate')} value={startDate ? shortDate(startDate) : null} empty={t('createTrip.pickOnCalendar')} />
            <View style={styles.ticketMiddle}>
              <Icon name="airplane" size={18} color={colors.accentSoft} flipInRtl />
              {days ? (
                <AppText variant="caption" style={styles.onTicketSoft} align="center">
                  {t('createTrip.days', { count: days })}
                </AppText>
              ) : null}
            </View>
            <TicketDate label={t('createTrip.endDate')} value={endDate ? shortDate(endDate) : null} empty="" end />
          </View>
        </View>

        {suggestions.length > 0 ? (
          <View style={styles.suggestions} accessibilityRole="list">
            {suggestions.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={destinationLabel(item, locale)}
                onPress={() => pickDestination(item)}
                style={({ pressed }) => [styles.suggestion, index > 0 && styles.suggestionDivider, pressed && styles.pressed]}
              >
                <Icon name="location-outline" size={18} color={colors.accent} />
                <AppText variant="bodyStrong">{item[locale].city}</AppText>
                <AppText variant="body" color="secondary" style={styles.flex}>
                  {item[locale].country}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Section icon="calendar-outline" title={t('createTrip.when')}>
          <View style={styles.panel}>
            <DateRangePicker value={range} onChange={changeRange} />
            <View style={styles.rangeFooter}>
              <AppText variant="caption" color="secondary" style={styles.flex}>
                {!startDate ? t('createTrip.pickStart') : !endDate ? t('createTrip.pickEnd') : t('createTrip.pickedRange', { count: days ?? 1 })}
              </AppText>
              {startDate || endDate ? (
                <Pressable accessibilityRole="button" hitSlop={hitSlop} onPress={() => changeRange({ start: null, end: null })}>
                  <AppText variant="label" color="accent">
                    {t('createTrip.clearDates')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
          {datesInvalid ? <InlineError message={t('createTrip.endBeforeStart')} /> : null}
        </Section>

        {showBaseLocation ? (
          <Section icon="bed-outline" title={t('createTrip.stayTitle')} aside={t('createTrip.optional')}>
            <TextField
              label={t('createTrip.baseLocation')}
              placeholder={t('createTrip.baseLocationPlaceholder')}
              hint={t('createTrip.baseLocationHint')}
              value={baseLocation}
              onChangeText={setBaseLocation}
              maxLength={TRIP_BASE_LOCATION_MAX}
              returnKeyType="done"
            />
            {neighborhoods.length > 0 && listed ? (
              <View style={styles.chips}>
                {neighborhoods.map((area) => {
                  const value = `${area[locale]}, ${listed[locale].city}`;
                  const on = baseLocation === value;
                  return (
                    <Pressable
                      key={area.en}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setBaseLocation(on ? '' : value)}
                      hitSlop={compactHitSlop}
                      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                    >
                      <AppText variant="label" color={on ? 'onAccent' : 'primary'}>
                        {area[locale]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Section>
        ) : null}

        <Section icon="create-outline" title={t('createTrip.nameTitle')}>
          <TextField
            label={t('createTrip.name')}
            placeholder={t('createTrip.namePlaceholder')}
            hint={!titleTouched && title ? t('createTrip.nameSuggested') : undefined}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setTitleTouched(true);
              if (titleError) setTitleError(null);
            }}
            error={titleError}
            maxLength={TRIP_TITLE_MAX}
            returnKeyType="done"
          />
        </Section>

        {error ? <InlineError message={error} /> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={submitLabel} onPress={submit} loading={submitting} disabled={!title.trim() || datesInvalid || !changed} />
      </View>
    </View>
  );
}

function TicketDate({ label, value, empty, end = false }: { label: string; value: string | null; empty: string; end?: boolean }) {
  return (
    <View style={[styles.ticketDate, end && styles.ticketDateEnd]}>
      <AppText variant="caption" style={styles.onTicketSoft} align={end ? 'end' : 'start'}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={value ? styles.onTicket : styles.onTicketSoft} align={end ? 'end' : 'start'} numberOfLines={1}>
        {value ?? (empty || '—')}
      </AppText>
    </View>
  );
}

function Section({ icon, title, aside, children }: { icon: IconName; title: string; aside?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Icon name={icon} size={18} color={colors.accent} />
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {aside ? (
          <AppText variant="caption" color="tertiary">
            {aside}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xxl, paddingBottom: spacing.xxxl },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.7 },

  ticket: { backgroundColor: colors.accent, borderRadius: radii.xl, overflow: 'hidden' },
  ticketTop: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm },
  destinationInput: {
    ...typography.display,
    fontSize: 32,
    lineHeight: 38,
    color: colors.textOnAccent,
    paddingVertical: spacing.xs,
    minHeight: 46,
  },
  perforation: { height: NOTCH, flexDirection: 'row', alignItems: 'center' },
  notch: { width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: colors.background },
  notchStart: { marginStart: -NOTCH / 2 },
  notchEnd: { marginEnd: -NOTCH / 2 },
  dashes: { flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderOnAccent, marginHorizontal: spacing.sm },
  ticketBottom: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  ticketDate: { flex: 1, gap: spacing.xxs },
  ticketDateEnd: { alignItems: 'flex-end' },
  ticketMiddle: { alignItems: 'center', gap: spacing.xxs, minWidth: 56 },
  onTicket: { color: colors.textOnAccent },
  onTicketSoft: { color: colors.textOnAccentSecondary },

  suggestions: { marginTop: -spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, paddingHorizontal: spacing.lg },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  suggestionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  section: { gap: spacing.md },
  panel: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm },
  rangeFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs, paddingTop: spacing.xs },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  chipOn: { backgroundColor: colors.accent },

  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
