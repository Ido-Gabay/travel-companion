import type { SupportedLocale } from '@travel-companion/shared';
import { en, type Translations } from './en';
import { he } from './he';

export const resources: Record<SupportedLocale, Translations> = { en, he };
