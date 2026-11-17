import { useSyncExternalStore } from 'react';

/**
 * Whether the API was reachable on the last request (M12a). Learned from real
 * requests instead of a network-state native module (no new native dependency):
 * any response from the server = online; a network failure or timeout = offline.
 */
export type ConnectionStatus = 'unknown' | 'online' | 'offline';

let status: ConnectionStatus = 'unknown';
const listeners = new Set<() => void>();

function set(next: ConnectionStatus): void {
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener();
}

export const reportReachable = (): void => set('online');
export const reportUnreachable = (): void => set('offline');
export const getConnection = (): ConnectionStatus => status;

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnection(): ConnectionStatus {
  return useSyncExternalStore(subscribeConnection, getConnection, getConnection);
}

/** For tests. */
export function resetConnectionForTests(): void {
  status = 'unknown';
  listeners.clear();
}
