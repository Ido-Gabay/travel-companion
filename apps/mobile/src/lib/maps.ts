/**
 * Link to the phone's maps app, searching for text the user typed.
 * Nothing is fetched or stored from a maps provider; the user's own name and
 * address are just passed along as a search, which works on any phone.
 */
export function mapsSearchQuery(name: string, address: string | null): string {
  return address ? `${name}, ${address}` : name;
}

export function mapsSearchUrl(query: string, platform: string): string {
  const q = encodeURIComponent(query);
  return platform === 'ios'
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
