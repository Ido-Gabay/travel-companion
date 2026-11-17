import { Linking, Platform } from 'react-native';
import { mapsSearchQuery, mapsSearchUrl } from '@/lib/maps';

export function openInMaps(name: string, address: string | null): void {
  void Linking.openURL(mapsSearchUrl(mapsSearchQuery(name, address), Platform.OS)).catch(() => undefined);
}
