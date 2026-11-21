import type { TripItem } from './model';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Icon, InlineError, ListGroup, Sheet } from '@/components/ui';
import { PlaceCard } from '@/features/places/PlaceCard';
import { colors } from '@/theme/tokens';

interface AddToDaySheetProps {
  visible: boolean;
  /** "Monday, November 23". */
  dayLabel: string;
  /** Saved places not planned yet. */
  wishlist: readonly TripItem[];
  /** Saved places already planned or done: adding one plans another visit. */
  again?: readonly TripItem[];
  /** Collection ids of places that already have a visit on this day. */
  onDay?: ReadonlySet<string>;
  /** Id of the place being added right now, if any. */
  addingId: string | null;
  error: string | null;
  onAdd: (place: TripItem) => void;
  onDiscover: () => void;
  onClose: () => void;
}

/**
 * Pick places for one day; the sheet stays open. A place added here is marked and further taps do
 * nothing (an added wishlist place moves to "again", where a stray tap used to plan it again).
 * A second visit on a day that already has one asks first.
 */
export function AddToDaySheet({
  visible,
  dayLabel,
  wishlist,
  again = [],
  onDay = NONE,
  addingId,
  error,
  onAdd,
  onDiscover,
  onClose,
}: AddToDaySheetProps) {
  const { t } = useTranslation();
  const [added, setAdded] = useState<ReadonlySet<string>>(NONE);

  useEffect(() => {
    if (visible) setAdded(NONE);
  }, [visible]);

  const add = (place: TripItem) => {
    if (added.has(place.placeId)) return;
    setAdded((current) => new Set(current).add(place.placeId));
    onAdd(place);
  };
  const addAgain = (place: TripItem) => {
    if (added.has(place.placeId)) return;
    if (!onDay.has(place.placeId)) {
      add(place);
      return;
    }
    Alert.alert(t('visits.sameDayTitle'), t('visits.sameDayBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('visits.sameDayConfirm'), onPress: () => add(place) },
    ]);
  };

  return (
    <Sheet
      visible={visible}
      title={t('itinerary.addToDay')}
      subtitle={dayLabel}
      onClose={onClose}
      footer={<Button label={t('common.done')} onPress={onClose} />}
    >
      {error ? <InlineError message={error} /> : null}
      {wishlist.length === 0 && again.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={t('itinerary.wishlistEmptyTitle')}
          body={t('itinerary.wishlistEmptyBody')}
          action={<Button label={t('tripDetail.discover')} icon="search" variant="secondary" onPress={onDiscover} />}
        />
      ) : (
        <>
          {wishlist.length > 0 ? (
            <ListGroup title={t('visits.notPlanned')}>
              {wishlist.map((place) => (
                <View key={place.id} style={addingId === place.id ? styles.adding : undefined}>
                  <PlaceCard
                    place={place}
                    showNotes={false}
                    badge={added.has(place.placeId) ? t('visits.addedHere') : null}
                    onPress={() => add(place)}
                    actions={<AddIcon added={added.has(place.placeId)} icon="add-circle" />}
                  />
                </View>
              ))}
            </ListGroup>
          ) : null}
          {again.length > 0 ? (
            <ListGroup title={t('visits.visitAgainGroup')}>
              {again.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  showNotes={false}
                  badge={added.has(place.placeId) ? t('visits.addedHere') : onDay.has(place.placeId) ? t('visits.onThisDay') : null}
                  onPress={() => addAgain(place)}
                  actions={<AddIcon added={added.has(place.placeId)} icon="repeat" />}
                />
              ))}
            </ListGroup>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const NONE: ReadonlySet<string> = new Set();

function AddIcon({ added, icon }: { added: boolean; icon: 'add-circle' | 'repeat' }) {
  return added ? (
    <Icon name="checkmark-circle" size={26} color={colors.success} />
  ) : (
    <Icon name={icon} size={icon === 'repeat' ? 24 : 28} color={colors.accent} />
  );
}

const styles = StyleSheet.create({
  adding: { opacity: 0.4 },
});
