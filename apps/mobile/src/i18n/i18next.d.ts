import type { en } from './en';

// Makes t('section.key') type-checked against the English resources.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
