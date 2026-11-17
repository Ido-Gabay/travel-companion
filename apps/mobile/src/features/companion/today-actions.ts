import type { TripDetail } from '@travel-companion/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { placesKey } from '@/features/places/queries';
import { placesForDay } from '@/features/trips/itinerary';
import { tripKey, tripsKey } from '@/features/trips/queries';
import { api } from '@/lib/api';
import { orderWithInserted, type TodayAction } from './today-engine';

/**
 * Runs a suggestion the user accepted. These are the same calls the user could
 * make by hand in the itinerary; nothing runs without a tap.
 */
export function useTodayAction(tripId: string, day: string, tomorrow: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: TodayAction): Promise<TripDetail> => {
      switch (action.type) {
        case 'shiftStart':
          return api.scheduleTripPlace(tripId, action.stopId, { startTime: action.startTime });
        case 'moveToTomorrow':
          if (!tomorrow) throw new Error('No next day in this trip.');
          return api.scheduleTripPlace(tripId, action.stopId, { day: tomorrow });
        case 'removeFromDay':
          return api.scheduleTripPlace(tripId, action.stopId, { day: null });
        case 'addToday': {
          if (action.source === 'collection') await api.addTripPlace(tripId, action.placeId);
          const scheduled = await api.scheduleTripPlace(tripId, action.placeId, { day });
          const ids = placesForDay(scheduled.places, day).map((place) => place.id);
          const order = orderWithInserted(ids, action.placeId, action.afterStopId);
          if (order.join() === ids.join()) return scheduled;
          return api.reorderTripDay(tripId, day, { placeIds: order });
        }
      }
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(tripKey(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: [...tripsKey, 'list'] });
      void queryClient.invalidateQueries({ queryKey: placesKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: tripKey(tripId) }),
  });
}
