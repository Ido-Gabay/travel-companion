import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_LOCALE,
  isRtlLocale,
  localeSchema,
  type SupportedLocale,
} from '@travel-companion/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nManager } from 'react-native';
import { setI18nLanguage } from './i18n';

const STORAGE_KEY = 'app.locale';

export type Direction = 'ltr' | 'rtl';

interface LocaleContextValue {
  locale: SupportedLocale;
  direction: Direction;
  isRtl: boolean;
  /** False until the saved language has been read from storage. */
  ready: boolean;
  setLocale: (locale: SupportedLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Applies the native layout direction for the next app launch. The current
 * session flips immediately through the `direction` style on the root view.
 */
function applyNativeDirection(locale: SupportedLocale): void {
  const rtl = isRtlLocale(locale);
  if (I18nManager.isRTL === rtl) return;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}

/**
 * Owns the app language. English is the default. The choice is saved on the
 * device (so the sign-in screens use it) and in the user's server preferences.
 */
export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        const parsed = localeSchema.safeParse(stored);
        if (!cancelled && parsed.success) {
          setLocaleState(parsed.data);
          setI18nLanguage(parsed.data);
          applyNativeDirection(parsed.data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    setI18nLanguage(next);
    applyNativeDirection(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const isRtl = isRtlLocale(locale);
    return { locale, direction: isRtl ? 'rtl' : 'ltr', isRtl, ready, setLocale };
  }, [locale, ready, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside AppLocaleProvider');
  return value;
}
