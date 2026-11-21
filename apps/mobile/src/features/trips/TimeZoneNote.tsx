import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui';

/**
 * Required attribution (ODbL) wherever a time zone computed from the boundary
 * data is shown: timezone-boundary-builder, from OpenStreetMap data.
 */
export function TimeZoneNote() {
  const { t } = useTranslation();
  return (
    <AppText variant="caption" color="tertiary">
      {t('about.timeZoneData')}
    </AppText>
  );
}
