import type { Trip } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ListRow } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates } from '@/lib/dates';

/** One trip as a list row (use inside a ListGroup). Opens the trip on tap. */
export function TripCard({ trip }: { trip: Trip }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dates = formatTripDates(trip.startDate, trip.endDate, locale) ?? t('trips.noDates');
  const subtitle = [trip.destination ?? t('trips.noDestination'), dates].join(' · ');

  return (
    <ListRow
      title={trip.title}
      subtitle={subtitle}
      leading="airplane-outline"
      value={trip.placeCount > 0 ? t('trips.placeCountShort', { count: trip.placeCount }) : undefined}
      onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
    />
  );
}
