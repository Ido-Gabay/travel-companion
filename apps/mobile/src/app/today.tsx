import { useLocalSearchParams } from 'expo-router';
import { TodayScreen } from '@/features/companion/TodayScreen';

/** Live Today for a trip. `preview=1` shows a chosen day and time instead of now. */
export default function TodayRoute() {
  const { tripId = '', preview } = useLocalSearchParams<{ tripId: string; preview?: string }>();
  return <TodayScreen tripId={tripId} forcePreview={preview === '1'} />;
}
