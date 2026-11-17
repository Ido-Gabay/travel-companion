import type { TripDetail, TripPlace } from '@travel-companion/shared';
import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Sheet } from '@/components/ui';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { dayTitle, formatStartTime } from '@/features/trips/itinerary';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';
import { resolveConflict, usePendingState } from './ops-store';
import type { Conflict } from './sync';

/**
 * Changes that couldn't be synced safely (M12a). Each one waits here until the
 * user decides; nothing is overwritten or thrown away without that choice.
 */
export function ConflictSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { conflicts } = usePendingState();
  return (
    <Sheet visible={visible} title={t('offline.conflictsTitle')} subtitle={t('offline.conflictsBody')} onClose={onClose}>
      {conflicts.length === 0 ? (
        <AppText variant="body" color="secondary">
          {t('offline.noConflicts')}
        </AppText>
      ) : (
        conflicts.map((conflict) => <ConflictRow key={`${conflict.op.id}-${conflict.detectedAt}`} conflict={conflict} />)
      )}
    </Sheet>
  );
}

function findPlace(details: (TripDetail | undefined)[], placeId: string): TripPlace | null {
  for (const detail of details) {
    const match = detail?.places.find((place) => place.id === placeId);
    if (match) return match;
  }
  return null;
}

function ConflictRow({ conflict }: { conflict: Conflict }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const { op } = conflict;
  const details = queryClient.getQueriesData<TripDetail>({ queryKey: ['trips', 'detail'] }).map(([, detail]) => detail);
  const place = op.kind === 'reorder' ? null : findPlace(details, op.placeId);

  const show = (value: unknown): string => {
    if (op.kind === 'visited') return value ? t('offline.valueDone') : t('offline.valueNotDone');
    if (op.kind === 'schedule') {
      if (value === null || value === undefined) {
        return op.field === 'day' ? t('itinerary.wishlist') : op.field === 'startTime' ? t('itinerary.flexible') : t('offline.valueTypical');
      }
      if (op.field === 'day') return dayTitle(String(value), locale);
      if (op.field === 'startTime') return formatStartTime(String(value), locale);
      return formatDurationShort(Number(value), t);
    }
    return '';
  };

  const detail =
    conflict.reason === 'gone'
      ? t('offline.conflictGone')
      : conflict.reason === 'rejected'
        ? t('offline.conflictRejected')
        : op.kind === 'reorder'
          ? t('offline.conflictOrder', { day: dayTitle(op.day, locale) })
          : t('offline.conflictChanged', { mine: show(op.value), server: show(conflict.serverValue) });

  return (
    <View style={styles.row}>
      {place ? <PlaceTitle place={place} /> : (
        <AppText variant="bodyStrong">
          {op.kind === 'reorder' ? t('offline.dayOrder', { day: dayTitle(op.day, locale) }) : t('offline.unknownPlace')}
        </AppText>
      )}
      <AppText variant="body" color="secondary">
        {detail}
      </AppText>
      <View style={styles.actions}>
        {conflict.reason === 'changed' ? (
          <>
            <Button
              label={t('offline.keepMine')}
              variant="secondary"
              size="sm"
              block={false}
              onPress={() => void resolveConflict(queryClient, conflict, 'mine')}
            />
            <Button
              label={t('offline.useServer')}
              variant="ghost"
              size="sm"
              block={false}
              onPress={() => void resolveConflict(queryClient, conflict, 'server')}
            />
          </>
        ) : (
          <Button
            label={t('offline.discardMine')}
            variant="danger"
            size="sm"
            block={false}
            onPress={() => void resolveConflict(queryClient, conflict, 'server')}
          />
        )}
      </View>
    </View>
  );
}

function PlaceTitle({ place }: { place: TripPlace }) {
  const display = usePlaceDisplay(place);
  return <AppText variant="bodyStrong">{display.name}</AppText>;
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
