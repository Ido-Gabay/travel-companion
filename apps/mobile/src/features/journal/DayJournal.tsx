import { JOURNAL_NOTE_MAX, type TripPlace } from '@travel-companion/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, Sheet, TextField } from '@/components/ui';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import { colors, radii, spacing } from '@/theme/tokens';
import { useJournal, useUpdateJournalDay } from './queries';

/**
 * M15: the journal for one trip day, under its stops: a 1–5 rating, the user's note,
 * and what they did (stops marked Done, in the order they were done). Shown from the
 * day itself onwards, or earlier if something was already written. Works offline.
 */
export function DayJournal({ tripId, day, stops }: { tripId: string; day: string; stops: readonly TripPlace[] }) {
  const { t } = useTranslation();
  const journal = useJournal(tripId);
  const update = useUpdateJournalDay(tripId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const entry = journal.data?.days.find((item) => item.day === day);
  const done = stops.filter((stop) => stop.visitedAt !== null).sort((a, b) => (a.visitedAt ?? '').localeCompare(b.visitedAt ?? ''));
  const started = day <= toIsoDate(new Date());
  if (!started && !entry && done.length === 0) return null;

  const rating = entry?.rating ?? null;
  const setRating = (value: number) => update.mutate({ day, rating: value === rating ? null : value });
  const saveNote = () => {
    update.mutate({ day, note: draft });
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText variant="label" color="secondary" style={styles.flex} accessibilityRole="header">
          {t('journal.title')}
        </AppText>
        <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={t('journal.rating', { rating: rating ?? 0 })}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t('journal.rate', { value })}
              accessibilityState={{ selected: rating !== null && value <= rating }}
              onPress={() => setRating(value)}
            >
              <Icon name={rating !== null && value <= rating ? 'star' : 'star-outline'} size={22} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('journal.noteHint')}
        onPress={() => {
          setDraft(entry?.note ?? '');
          setEditing(true);
        }}
        style={({ pressed }) => [styles.note, pressed && styles.pressed]}
      >
        <AppText variant="body" color={entry?.note ? 'primary' : 'tertiary'} numberOfLines={4}>
          {entry?.note ?? t('journal.addNote')}
        </AppText>
      </Pressable>

      {done.length > 0 ? (
        <View style={styles.done}>
          <AppText variant="caption" color="secondary">
            {t('journal.whatYouDid')}
          </AppText>
          {done.map((stop) => (
            <DoneRow key={stop.id} stop={stop} />
          ))}
          {done.some((stop) => stop.source === 'google') ? <GoogleAttribution inline align="start" /> : null}
        </View>
      ) : null}

      <Sheet
        visible={editing}
        title={t('journal.noteTitle')}
        onClose={() => setEditing(false)}
        footer={<Button label={t('common.save')} onPress={saveNote} disabled={(draft.trim() || null) === (entry?.note ?? null)} />}
      >
        <TextField
          label={t('journal.noteTitle')}
          placeholder={t('journal.notePlaceholder')}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={JOURNAL_NOTE_MAX}
        />
      </Sheet>
    </View>
  );
}

function DoneRow({ stop }: { stop: TripPlace }) {
  const { locale } = useLocale();
  const display = usePlaceDisplay(stop);
  const at = stop.visitedAt
    ? new Date(stop.visitedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <View style={styles.doneRow}>
      <Icon name={stop.highlight ? 'star' : 'checkmark-circle'} size={16} color={stop.highlight ? colors.accent : colors.success} />
      <AppText variant="body" style={styles.flex} numberOfLines={1}>
        {display.name}
      </AppText>
      <AppText variant="caption" color="tertiary">
        {at}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  stars: { flexDirection: 'row', gap: spacing.xs },
  note: { padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  done: { gap: spacing.xs },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
