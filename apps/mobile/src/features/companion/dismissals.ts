import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hints and suggestions the user dismissed, remembered on this phone for one
 * trip day (not synced: dismissing is a personal "not now", not a change to
 * the plan). Old days are simply never read again.
 */
const keyFor = (tripId: string, day: string) => `today-dismissed:${tripId}:${day}`;

export function useDismissals(tripId: string, day: string | null) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!day) return;
    let active = true;
    AsyncStorage.getItem(keyFor(tripId, day))
      .then((raw) => {
        if (!active) return;
        const ids: unknown = raw ? JSON.parse(raw) : [];
        setDismissed(new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []));
      })
      .catch(() => active && setDismissed(new Set()));
    return () => {
      active = false;
    };
  }, [tripId, day]);

  const dismiss = useCallback(
    (id: string) => {
      if (!day) return;
      setDismissed((current) => {
        const next = new Set(current).add(id);
        AsyncStorage.setItem(keyFor(tripId, day), JSON.stringify([...next])).catch(() => undefined);
        return next;
      });
    },
    [tripId, day],
  );

  return { dismissed, dismiss };
}
