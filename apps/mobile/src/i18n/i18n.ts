import { DEFAULT_LOCALE, type SupportedLocale } from '@travel-companion/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

/** Initialized once, synchronously; translations are bundled with the app. */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: resources.en },
    he: { translation: resources.he },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function setI18nLanguage(locale: SupportedLocale): void {
  void i18n.changeLanguage(locale);
}

export default i18n;
