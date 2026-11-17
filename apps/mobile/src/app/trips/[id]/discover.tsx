import { useLocalSearchParams } from 'expo-router';
import { DiscoverScreen } from '@/features/discover/DiscoverScreen';

/** Discovery opened from a trip: results go to this trip's wishlist by default. */
export default function TripDiscoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DiscoverScreen mode="modal" {...(id ? { tripId: id } : {})} />;
}
