import type { MapStyleElement } from 'react-native-maps';

/**
 * A quiet Google map style for map-first screens (free: styling is part of
 * the Maps SDK, no extra API call). Roads and land go grey, business labels
 * are hidden so our own pins carry the colour; parks and water stay faintly
 * tinted so the city is still readable. Transit stations stay visible.
 */
export const quietMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F2F0EC' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7A818A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F6F4F0' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 30 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E1E9DF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E8E4DD' }] },
  { featureType: 'transit.station', elementType: 'labels.icon', stylers: [{ saturation: -60 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D6E2E6' }] },
];
