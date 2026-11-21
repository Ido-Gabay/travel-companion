import { PLACE_LABEL_MAX, type TripDetailV2 } from '@travel-companion/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { placesKey } from '@/features/places/queries';
import { tripKey, tripsKey } from '@/features/trips/queries';
import { api } from '@/lib/api';
import type { ImportRow } from './place-import';

/**
 * Saves the chosen places: each one reuses the saved copy when there is one,
 * else becomes a place of the user's own (no Google lookup), then joins the
 * trip's wishlist (no visit). Online, one place at a time. A retry after a
 * failure reuses what was already created, so nothing is saved twice.
 */
export function useImportPlaces(tripId: string) {
    const queryClient = useQueryClient();
    const created = useRef(new Map<string, string>());
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const mutation = useMutation({
        mutationFn: async ({
            rows,
            links,
        }: {
            rows: readonly ImportRow[];
            /** Rows the user linked to a Google Maps result: key → Google place ID. */
            links: ReadonlyMap<string, string>;
        }): Promise<{ added: number; detail: TripDetailV2 | null }> => {
            let detail: TripDetailV2 | null = null;
            let done = 0;
            setProgress({ done, total: rows.length });
            for (const row of rows) {
                const googlePlaceId = links.get(row.key);
                if (googlePlaceId) {
                    // Deduped by Google place ID on the server, and joined to the trip in the same call.
                    const { places } = await api.saveGooglePlaces({ items: [{ googlePlaceId, category: 'other' }], tripId });
                    const saved = places[0];
                    const own = {
                        ...(row.note && !saved?.notes ? { notes: row.note } : {}),
                        ...(!saved?.myLabel ? { myLabel: row.name.slice(0, PLACE_LABEL_MAX).trim() } : {}),
                    };
                    if (saved && Object.keys(own).length > 0) await api.updatePlace(saved.id, own);
                    done += 1;
                    setProgress({ done, total: rows.length });
                    continue;
                }
                let placeId = row.placeId ?? created.current.get(row.key) ?? null;
                if (!placeId) {
                    const place = await api.createPlace({
                        name: row.name,
                        ...(row.note ? { notes: row.note } : {}),
                        ...(row.area ? { address: row.area } : {}),
                    });
                    placeId = place.id;
                    created.current.set(row.key, placeId);
                }
                // Joining is idempotent on the server, so a retried place is never added twice.
                if (row.status !== 'inTrip') detail = await api.addTripMember(tripId, { placeId });
                done += 1;
                setProgress({ done, total: rows.length });
            }
            return { added: done, detail: rows.some((row) => links.has(row.key)) ? null : detail };
        },
        onSuccess: ({ detail }) => {
            if (detail) queryClient.setQueryData(tripKey(tripId), detail);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: tripsKey });
            void queryClient.invalidateQueries({ queryKey: placesKey });
        },
    });

    return { ...mutation, progress };
}
