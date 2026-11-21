import { placeCategorySchema } from '@travel-companion/shared';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { DiscoverScreen } from '@/features/discover/DiscoverScreen';

/** Discovery opened from a trip: results go to this trip's wishlist by default. */
export default function TripDiscoverScreen() {
  const params = useLocalSearchParams<{ id: string; q?: string; cat?: string; lat?: string; lng?: string; label?: string }>();
  // D1 trip assistant: "find dinner near where I finish" opens here with that search.
  const initialSearch = useMemo(() => {
    const latitude = Number(params.lat);
    const longitude = Number(params.lng);
    const category = placeCategorySchema.safeParse(params.cat);
    if (!params.q || !category.success || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    return {
      plan: { textQuery: params.q.slice(0, 200), includedType: null, openNow: false, category: category.data },
      area: { kind: 'circle' as const, center: { latitude, longitude }, radiusMeters: 1000 },
      label: params.label ?? params.q,
    };
  }, [params.q, params.cat, params.lat, params.lng, params.label]);
  return <DiscoverScreen mode="modal" {...(params.id ? { tripId: params.id } : {})} {...(initialSearch ? { initialSearch } : {})} />;
}
