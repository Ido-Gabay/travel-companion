import type { Trip } from '@travel-companion/shared';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, ListGroup, ListRow, Sheet } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { WhereKey } from './search-presets';

interface ContextSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Where to search. Hidden for AI search (the AI decides the area). */
  wheres: readonly WhereKey[] | null;
  where: WhereKey;
  whereLabel: (key: WhereKey) => string;
  onWhere: (key: WhereKey) => void;
  /** Where saved places go. Hidden when the user has no trips. */
  trips: readonly Trip[] | null;
  tripId: string | null;
  onTrip: (tripId: string | null) => void;
}

const check = <Icon name="checkmark" size={20} color={colors.accent} />;

/**
 * Discover's two settings in one place: where to search, and where saved places go.
 * Opened from the single context line under the search box.
 */
export function ContextSheet({
  visible,
  onClose,
  wheres,
  where,
  whereLabel,
  onWhere,
  trips,
  tripId,
  onTrip,
}: ContextSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} title={t('discover.contextTitle')} onClose={onClose}>
      {wheres ? (
        <ListGroup title={t('discover.searchWhere')}>
          {wheres.map((key) => (
            <ListRow
              key={key}
              title={whereLabel(key)}
              leading={key === 'me' ? 'navigate-outline' : key === 'hotel' ? 'bed-outline' : 'location-outline'}
              trailing={key === where ? check : undefined}
              selected={key === where}
              chevron={false}
              accessibilityLabel={whereLabel(key)}
              onPress={() => {
                onClose();
                // Choosing "near my hotel" may open the hotel pin sheet; iOS can't present it
                // while this sheet is still sliding away, so apply the choice after it closes.
                setTimeout(() => onWhere(key), Platform.OS === 'ios' ? 450 : 0);
              }}
            />
          ))}
        </ListGroup>
      ) : null}
      {trips ? (
        <ListGroup title={t('discover.saveWhere')} footer={t('discover.saveWhereHint')}>
          <ListRow
            title={t('discover.collectionOnly')}
            leading="bookmark-outline"
            trailing={tripId === null ? check : undefined}
            selected={tripId === null}
            chevron={false}
            onPress={() => {
              onTrip(null);
              onClose();
            }}
          />
          {trips.map((trip) => (
            <ListRow
              key={trip.id}
              title={t('discover.tripWishlist', { trip: trip.title })}
              leading="airplane-outline"
              trailing={trip.id === tripId ? check : undefined}
              selected={trip.id === tripId}
              chevron={false}
              onPress={() => {
                onTrip(trip.id);
                onClose();
              }}
            />
          ))}
        </ListGroup>
      ) : null}
    </Sheet>
  );
}
