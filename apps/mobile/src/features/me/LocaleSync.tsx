import { useEffect, useRef } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useMe, useUpdatePreferences } from './queries';

/**
 * Keeps the app language and the server preference in step after sign-in.
 * - The server preference wins once the user has set it (version > 1).
 * - A brand-new account (never changed, version 1) adopts the language the
 *   user already picked on the welcome screen.
 */
export function LocaleSync() {
  const { data: me } = useMe();
  const { locale, setLocale } = useLocale();
  const updatePreferences = useUpdatePreferences();
  const handledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const marker = `${me.id}:${me.preferences.version}`;
    if (handledFor.current === marker) return;
    handledFor.current = marker;

    const server = me.preferences.locale;
    if (server === locale) return;

    if (me.preferences.version === 1) {
      updatePreferences.mutate({ locale });
    } else {
      setLocale(server);
    }
    // Only react to new server data, not to local changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.preferences.version]);

  return null;
}
