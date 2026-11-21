import { MAX_IMPORT_PLACES, MAX_IMPORT_TEXT, categoryForGoogleType, type PlaceCategory } from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { AppText, Button, Icon, InlineError, NavHeader, SegmentedControl, TextField } from '@/components/ui';
import { getConnection, useConnection } from '@/features/offline/connection';
import { Tag } from '@/features/planning/PlanParts';
import {
  candidate,
  dedupe,
  looksLikeTakeoutCsv,
  matchExisting,
  parseList,
  parseTakeoutCsv,
  type ImportCandidate,
  type ImportRow,
} from '@/features/places/place-import';
import { useGooglePlaces, usePlaces } from '@/features/places/queries';
import { GoogleLinkSheet } from '@/features/places/GoogleLinkSheet';
import { useImportPlaces } from '@/features/places/use-import-places';
import { pickCsvFile } from '@/features/places/pick-csv';
import { useTrip } from '@/features/trips/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, compactHitSlop, radii, spacing, weights } from '@/theme/tokens';

type Mode = 'paste' | 'csv';
type Notice = 'none' | 'empty' | 'notTakeout' | 'offline' | 'unavailable' | 'tooLong' | 'error' | 'unreadable' | 'tooBig';

/**
 * Import a list into the trip's wishlist: pasted text or a Google Takeout CSV.
 * Lists and CSVs are read on the phone; only free text (a chat message) goes
 * to the AI, once, on tap. Nothing is looked up on Google: places are saved by
 * name, without a location, and only after the user reviews them.
 */
export default function ImportPlacesScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const connection = useConnection();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const places = usePlaces();
  const importer = useImportPlaces(id);
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<Notice>('none');
  const [found, setFound] = useState<ImportCandidate[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  // Rows the user linked to a Google Maps result (in memory only until saved, by place ID).
  const [links, setLinks] = useState<ReadonlyMap<string, { placeId: string; name: string; category: PlaceCategory }>>(new Map());
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const extract = useMutation({ mutationFn: api.extractPlaces });

  // Names the phone already knows: the user's own, and Google's only if already in memory.
  const googleIds = useMemo(
    () => (places.data?.items ?? []).flatMap((place) => (place.googlePlaceId ? [place.googlePlaceId] : [])),
    [places.data],
  );
  const google = useGooglePlaces(googleIds, false);
  const inTrip = useMemo(() => new Set(trip.data?.saved.map((place) => place.id) ?? []), [trip.data]);
  const rows: ImportRow[] = useMemo(() => {
    if (!found) return [];
    const saved = (places.data?.items ?? []).map((place) => ({
      id: place.id,
      names: [place.name, place.myLabel, place.googlePlaceId ? (google.get(place.googlePlaceId)?.name ?? null) : null],
    }));
    return matchExisting(found, saved, inTrip);
  }, [found, places.data, google, inTrip]);
  const choosable = rows.filter((row) => row.status !== 'inTrip');
  const chosen = choosable.filter((row) => selected.has(row.key));

  const show = (list: ImportCandidate[]) => {
    const limited = list.slice(0, MAX_IMPORT_PLACES);
    setTruncated(list.length > MAX_IMPORT_PLACES);
    if (limited.length === 0) {
      setNotice('empty');
      return;
    }
    setNotice('none');
    setFound(limited);
    setLinks(new Map());
    // Everything starts selected; places already in the trip can't be chosen (shown, unchecked).
    setSelected(new Set(limited.map((item) => item.key)));
  };

  const run = () => {
    const input = text.trim();
    if (!input) return;
    if (mode === 'csv' || looksLikeTakeoutCsv(input)) {
      const csv = parseTakeoutCsv(input);
      if (csv.kind === 'places') show(csv.places);
      else setNotice(csv.kind === 'notTakeout' ? 'notTakeout' : 'empty');
      return;
    }
    const list = parseList(input);
    if (list) {
      show(list);
      return;
    }
    // Free text: one AI call, only on tap and only online.
    if (input.length > MAX_IMPORT_TEXT) {
      setNotice('tooLong');
      return;
    }
    if (getConnection() === 'offline') {
      setNotice('offline');
      return;
    }
    setNotice('none');
    extract.mutate(
      { text: input, locale },
      {
        onSuccess: (response) => {
          if (response.action === 'unavailable') {
            setNotice('unavailable');
            return;
          }
          show(dedupe(response.places.flatMap((place) => candidate(place.name, place.note, place.area) ?? [])));
        },
        onError: () => setNotice(getConnection() === 'offline' ? 'offline' : 'error'),
      },
    );
  };

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allOn = choosable.length > 0 && chosen.length === choosable.length;

  const save = () =>
    importer.mutate(
      { rows: chosen, links: new Map([...links].map(([key, link]) => [key, { googlePlaceId: link.placeId, category: link.category }])) },
      { onSuccess: ({ added: count }) => setAdded(count) },
    );
  const linkingRow = linkingKey ? rows.find((row) => row.key === linkingKey) : undefined;

  const noticeText: Record<Exclude<Notice, 'none'>, string> = {
    empty: t('importPlaces.noneFound'),
    notTakeout: t('importPlaces.notTakeout'),
    offline: t('importPlaces.needsConnection'),
    unavailable: t('importPlaces.aiUnavailable'),
    tooLong: t('importPlaces.tooLong', { max: MAX_IMPORT_TEXT.toLocaleString(locale) }),
    error: t('importPlaces.aiError'),
    unreadable: t('importPlaces.fileUnreadable'),
    tooBig: t('importPlaces.fileTooBig'),
  };

  const chooseFile = async () => {
    setPicking(true);
    setNotice('none');
    const picked = await pickCsvFile();
    setPicking(false);
    // Cancelling just leaves the screen as it was.
    if (picked.kind === 'canceled') return;
    if (picked.kind !== 'text') {
      setNotice(picked.kind);
      return;
    }
    setFileName(picked.name);
    const csv = parseTakeoutCsv(picked.text);
    if (csv.kind === 'places') show(csv.places);
    else setNotice(csv.kind === 'notTakeout' ? 'notTakeout' : 'empty');
  };

  const footer =
    added !== null ? (
      <Button label={t('common.done')} onPress={() => router.back()} />
    ) : found ? (
      <View style={styles.footerStack}>
        {importer.progress && importer.isPending ? (
          <AppText variant="caption" color="secondary" align="center">
            {t('importPlaces.adding', { done: importer.progress.done, total: importer.progress.total })}
          </AppText>
        ) : null}
        <Button
          testID="import-add"
          label={chosen.length > 0 ? t('importPlaces.addCount', { count: chosen.length }) : t('importPlaces.chooseSome')}
          onPress={save}
          loading={importer.isPending}
          disabled={chosen.length === 0}
        />
      </View>
    ) : (
      <Button
        testID="import-extract"
        label={t('importPlaces.extract')}
        icon="sparkles-outline"
        onPress={run}
        loading={extract.isPending}
        disabled={!text.trim()}
      />
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('importPlaces.title')} mode="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {added !== null ? (
            <View style={styles.done}>
              <Icon name="checkmark-circle" size={44} color={colors.accent} />
              <AppText variant="title" align="center">
                {t('importPlaces.addedTitle', { count: added })}
              </AppText>
              <AppText variant="body" color="secondary" align="center">
                {t('importPlaces.addedBody')}
              </AppText>
            </View>
          ) : found ? (
            <>
              <View style={styles.reviewHead}>
                <View style={styles.flex}>
                  <AppText variant="heading" accessibilityRole="header">
                    {t('importPlaces.foundTitle', { count: rows.length })}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {t('importPlaces.foundBody')}
                  </AppText>
                </View>
                {choosable.length > 0 ? (
                  <Button
                    label={allOn ? t('importPlaces.clear') : t('importPlaces.selectAll')}
                    variant="ghost"
                    size="sm"
                    block={false}
                    onPress={() => setSelected(allOn ? new Set() : new Set(choosable.map((row) => row.key)))}
                  />
                ) : null}
              </View>
              {truncated ? (
                <AppText variant="caption" color="secondary">
                  {t('importPlaces.truncated', { max: MAX_IMPORT_PLACES })}
                </AppText>
              ) : null}
              <View style={styles.list}>
                {rows.map((row, index) => (
                  <ImportRowView
                    key={row.key}
                    row={row}
                    first={index === 0}
                    checked={row.status !== 'inTrip' && selected.has(row.key)}
                    disabled={importer.isPending || row.status === 'inTrip'}
                    linkedName={links.get(row.key)?.name ?? null}
                    onPress={() => toggle(row.key)}
                    onLink={row.status === 'new' && !importer.isPending ? () => setLinkingKey(row.key) : null}
                  />
                ))}
              </View>
              {importer.isError ? (
                <InlineError
                  message={connection === 'offline' ? t('importPlaces.saveOffline') : errorMessage(importer.error)}
                />
              ) : null}
              <Button
                label={t('importPlaces.startOver')}
                variant="ghost"
                size="sm"
                block={false}
                onPress={() => {
                  setFound(null);
                  setNotice('none');
                }}
              />
            </>
          ) : (
            <>
              <SegmentedControl
                accessibilityLabel={t('importPlaces.modeLabel')}
                options={[
                  { value: 'paste', label: t('importPlaces.modePaste') },
                  { value: 'csv', label: t('importPlaces.modeCsv') },
                ]}
                value={mode}
                onChange={(value) => {
                  setMode(value);
                  setNotice('none');
                }}
              />
              {mode === 'csv' ? (
                <View style={styles.dropzone}>
                  <Icon name="document-text-outline" size={28} color={colors.accent} />
                  <AppText variant="bodyStrong" align="center">
                    {t('importPlaces.csvTitle')}
                  </AppText>
                  <AppText variant="caption" color="secondary" align="center">
                    {t('importPlaces.csvBody')}
                  </AppText>
                  <Button
                    testID="import-choose-file"
                    label={t('importPlaces.chooseFile')}
                    icon="folder-open-outline"
                    block={false}
                    loading={picking}
                    onPress={() => void chooseFile()}
                  />
                  {fileName ? (
                    <AppText variant="caption" color="tertiary" align="center" numberOfLines={1}>
                      {fileName}
                    </AppText>
                  ) : null}
                </View>
              ) : (
                <AppText variant="body" color="secondary">
                  {t('importPlaces.pasteBody')}
                </AppText>
              )}
              <TextField
                label={mode === 'csv' ? t('importPlaces.csvLabel') : t('importPlaces.pasteLabel')}
                placeholder={mode === 'csv' ? t('importPlaces.csvPlaceholder') : t('importPlaces.pastePlaceholder')}
                value={text}
                onChangeText={(value) => {
                  setText(value);
                  if (notice !== 'none') setNotice('none');
                }}
                multiline
                textAlignVertical="top"
                autoCorrect={false}
                ltr={mode === 'csv'}
              />
              {notice !== 'none' ? <InlineError message={noticeText[notice]} /> : null}
              <AppText variant="caption" color="tertiary">
                {t('importPlaces.privacy')}
              </AppText>
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
      {linkingRow ? (
        <GoogleLinkSheet
          visible
          name={linkingRow.name}
          query={[linkingRow.name, linkingRow.area].filter(Boolean).join(' ')}
          near={trip.data?.destination ?? null}
          category="other"
          onPick={(result) => {
            setLinks((current) =>
              new Map(current).set(linkingRow.key, {
                placeId: result.placeId,
                name: result.name,
                category: categoryForGoogleType(result.primaryType),
              }),
            );
            setSelected((current) => new Set(current).add(linkingRow.key));
            setLinkingKey(null);
          }}
          onClose={() => setLinkingKey(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ImportRowView({
  row,
  first,
  checked,
  disabled,
  linkedName,
  onPress,
  onLink,
}: {
  row: ImportRow;
  first: boolean;
  checked: boolean;
  disabled: boolean;
  /** The Google Maps result the user linked this row to. */
  linkedName: string | null;
  onPress: () => void;
  /** Find this one on Google Maps (only for places not saved yet). */
  onLink: (() => void) | null;
}) {
  const { t } = useTranslation();
  const detail = [row.area, row.note].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={row.name}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.pressed]}
    >
      <Icon
        name={row.status === 'inTrip' ? 'checkmark-done' : checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={row.status === 'inTrip' ? colors.textTertiary : checked ? colors.accent : colors.textTertiary}
      />
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" color={row.status === 'inTrip' ? 'tertiary' : 'primary'} numberOfLines={2}>
          {row.name}
        </AppText>
        {detail ? (
          <AppText variant="caption" color="secondary" numberOfLines={2}>
            {detail}
          </AppText>
        ) : null}
        {row.status === 'inTrip' ? (
          <View style={styles.tagRow}>
            <Tag label={t('importPlaces.inTrip')} />
          </View>
        ) : row.status === 'saved' ? (
          <View style={styles.tagRow}>
            <Tag label={t('importPlaces.saved')} tone="accent" />
          </View>
        ) : linkedName ? (
          <View style={styles.tagRow}>
            <Tag label={t('googleLink.linkedTag', { name: linkedName })} tone="success" />
          </View>
        ) : null}
        {onLink ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('googleLink.rowA11y', { name: row.name })}
            hitSlop={compactHitSlop}
            onPress={onLink}
            style={styles.linkButton}
          >
            <Icon name="location-outline" size={14} color={colors.accent} />
            <AppText variant="caption" color="accent" style={styles.linkText}>
              {linkedName ? t('googleLink.change') : t('googleLink.rowAction')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerStack: { gap: spacing.sm },
  dropzone: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { backgroundColor: colors.surface, borderRadius: radii.card, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: spacing.xxs },
  tagRow: { flexDirection: 'row', paddingTop: spacing.xxs },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start', paddingTop: spacing.xs },
  linkText: { fontWeight: weights.semibold },
  pressed: { opacity: 0.7 },
  done: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.huge },
});
