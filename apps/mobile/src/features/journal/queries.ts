import type { TripJournal } from '@travel-companion/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { addOps, syncPending, usePendingState } from '@/features/offline/ops-store';
import { applyJournalOps, newOpId, type JournalField, type PendingOp } from '@/features/offline/pending-ops';
import { api } from '@/lib/api';

export const journalKey = (tripId: string) => ['trips', 'journal', tripId] as const;

/** M15: the trip journal, with notes/ratings not yet synced on top (saved on the phone for offline). */
export function useJournal(tripId: string) {
  const { session } = useAuth();
  const { ops } = usePendingState();
  const select = useCallback((journal: TripJournal) => applyJournalOps(journal, tripId, ops), [ops, tripId]);
  return useQuery({
    queryKey: journalKey(tripId),
    queryFn: () => api.getJournal(tripId),
    enabled: session !== null && tripId.length > 0,
    // Starts empty (and stays usable if the first load fails offline), so notes written
    // offline before the journal ever loaded still show. updatedAt 0 = always refreshed.
    initialData: { days: [] },
    initialDataUpdatedAt: 0,
    select,
  });
}

/** Write a day's note or rating: recorded on the phone first (works offline), then synced. */
export function useUpdateJournalDay(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ day, ...body }: { day: string; note?: string | null; rating?: number | null }) => {
      const server = queryClient.getQueryData<TripJournal>(journalKey(tripId))?.days.find((entry) => entry.day === day);
      const now = Date.now();
      const ops: PendingOp[] = (['note', 'rating'] as const)
        .filter((field): field is JournalField => body[field] !== undefined)
        .map((field, index) => {
          const raw = body[field] ?? null;
          const value = typeof raw === 'string' ? raw.trim() || null : raw;
          return {
            id: newOpId(now + index),
            kind: 'journal',
            tripId,
            day,
            field,
            value,
            base: server ? server[field] : null,
            createdAt: now + index,
          };
        });
      await addOps(ops);
      void syncPending(queryClient);
    },
  });
}
