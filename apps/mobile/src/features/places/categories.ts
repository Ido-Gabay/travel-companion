import type { PlaceCategory } from '@travel-companion/shared';
import { PLACE_CATEGORIES } from '@travel-companion/shared';
import type { IconName } from '@/components/ui';

export const CATEGORY_ICONS: Record<PlaceCategory, IconName> = {
  food: 'restaurant-outline',
  coffee: 'cafe-outline',
  sights: 'camera-outline',
  shopping: 'bag-handle-outline',
  nightlife: 'wine-outline',
  outdoors: 'leaf-outline',
  stay: 'bed-outline',
  other: 'location-outline',
};

/** Groups items by category in the fixed display order, skipping empty groups. */
export function groupByCategory<T extends { category: PlaceCategory }>(
  items: readonly T[],
): { category: PlaceCategory; items: T[] }[] {
  return PLACE_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}
