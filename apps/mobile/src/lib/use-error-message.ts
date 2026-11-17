import { useTranslation } from 'react-i18next';
import { toClientErrorCode } from './api-error';

/** Translated, user-facing message for any error thrown by the API client. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown): string => t(`errors.${toClientErrorCode(error)}`);
}
