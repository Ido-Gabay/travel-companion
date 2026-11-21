import type { TripDetailV2 } from '@travel-companion/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { placesKey } from '@/features/places/queries';
import { newId } from '@/features/trips/model';
import { tripKey, tripsKey } from '@/features/trips/queries';
import { stopOrder } from '@/features/offline/sync';
import { api } from '@/lib/api';
import { orderWithInserted, type TodayAction } from './today-engine';

/**
 * Runs a suggestion the user accepted. These are the same changes the user
 * could make by hand in the itinerary; nothing runs without a tap.
 * D1: stop ids are visit ids; a wishlist candidate's id is its saved-place id.
 */
export function useTodayAction(tripId: string, day: string, tomorrow: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: TodayAction): Promise<TripDetailV2> => {
      switch (action.type) {
        case 'shiftStart':
          await api.updateStop(tripId, action.stopId, { startTime: action.startTime });
          return api.getTripV2(tripId);
        case 'moveToTomorrow':
          if (!tomorrow) throw new Error('No next day in this trip.');
          await api.updateStop(tripId, action.stopId, { day: tomorrow });
          return api.getTripV2(tripId);
        case 'removeFromDay':
          return api.removeStop(tripId, action.stopId, false);
        case 'addToday': {
          let tripPlaceId = action.placeId;
          if (action.source === 'collection') {
            const saved = await api.addTripMember(tripId, { placeId: action.placeId });
            tripPlaceId = saved.places.find((place) => place.id === action.placeId)?.tripPlaceId ?? '';
          }
          const added = await api.addStop(tripId, { id: newId(), tripPlaceId, day });
          const detail = await api.getTripV2(tripId);
          const ids = stopOrder(detail.stops, day);
          const order = orderWithInserted(ids, added.stop.id, action.afterStopId);
          if (order.join() === ids.join()) return detail;
          return api.reorderStops(tripId, day, order);
        }
      }
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(tripKey(detail.trip.id), detail);
      void queryClient.invalidateQueries({ queryKey: [...tripsKey, 'list'] });
      void queryClient.invalidateQueries({ queryKey: placesKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: tripKey(tripId) }),
  });
}
