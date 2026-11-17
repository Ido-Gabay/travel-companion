import type { TripPlace } from '@travel-companion/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Icon, InlineError, ListGroup, Sheet } from '@/components/ui';
import { PlaceCard } from '@/features/places/PlaceCard';
import { colors } from '@/theme/tokens';

interface AddToDaySheetProps {
  visible: boolean;
  /** "Monday, November 23". */
  dayLabel: string;
  wishlist: readonly TripPlace[];
  /** Id of the place being added right now, if any. */
  addingId: string | null;
  error: string | null;
  onAdd: (place: TripPlace) => void;
  onDiscover: () => void;
  onClose: () => void;
}

/** Pick places from the trip's wishlist for one day. Each tap adds one; the sheet stays open. */
export function AddToDaySheet({
  visible,
  dayLabel,
  wishlist,
  addingId,
  error,
  onAdd,
  onDiscover,
  onClose,
}: AddToDaySheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      visible={visible}
      title={t('itinerary.addToDay')}
      subtitle={dayLabel}
      onClose={onClose}
      footer={<Button label={t('common.done')} onPress={onClose} />}
    >
      {error ? <InlineError message={error} /> : null}
      {wishlist.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={t('itinerary.wishlistEmptyTitle')}
          body={t('itinerary.wishlistEmptyBody')}
          action={<Button label={t('tripDetail.discover')} icon="search" variant="secondary" onPress={onDiscover} />}
        />
      ) : (
        <ListGroup>
          {wishlist.map((place) => (
            <View key={place.id} style={addingId === place.id ? styles.adding : undefined}>
              <PlaceCard
                place={place}
                showNotes={false}
                onPress={() => onAdd(place)}
                actions={<Icon name="add-circle" size={28} color={colors.accent} />}
              />
            </View>
          ))}
        </ListGroup>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  adding: { opacity: 0.4 },
});
