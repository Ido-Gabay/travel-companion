import {
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  PLACE_CATEGORIES,
  type Place,
  type PlaceCategory,
} from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { googleMapsEnabled, PlacesMap } from '@/components/maps/PlacesMap';
import {
  AppText,
  Button,
  ErrorState,
  IconButton,
  InlineError,
  ListGroup,
  ListRow,
  LoadingState,
  NavHeader,
  Section,
  useActionMenu,
} from '@/components/ui';
import { CategoryChips } from '@/features/places/CategoryChips';
import { NotesTagsEditor } from '@/features/places/NotesTagsEditor';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceForm } from '@/features/places/PlaceForm';
import { useDeletePlace, usePlace, useUpdatePlace } from '@/features/places/queries';
import { TripMembership } from '@/features/places/TripMembership';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function PlaceScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const place = usePlace(id);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader action={place.data ? <PlaceMenu place={place.data} /> : undefined} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {place.isPending ? (
            <LoadingState />
          ) : place.isError ? (
            <ErrorState message={errorMessage(place.error)} onRetry={() => void place.refetch()} />
          ) : (
            <PlaceDetail place={place.data} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PlaceDetail({ place }: { place: Place }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const display = usePlaceDisplay(place);
  const update = useUpdatePlace(place.id);
  const visited = place.visitedAt !== null;
  const google = display.google;
  const placeId = place.googlePlaceId;

  const openUrl = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <>
      {/* Hero */}
      <View style={styles.hero}>
        <AppText variant="label" color="accent">
          {display.typeLabel ?? t(`categories.${place.category}`)}
        </AppText>
        <AppText variant="display" accessibilityRole="header">
          {display.name}
        </AppText>
        {display.address ? (
          <AppText variant="body" color="secondary">
            {display.address}
          </AppText>
        ) : null}
        {display.unavailable ? (
          <InlineError message={t('places.detailsUnavailable')} />
        ) : null}
        {google && !googleMapsEnabled ? <GoogleAttribution align="start" /> : null}
      </View>

      {/* Map + navigation */}
      {google?.location ? (
        <PlacesMap
          points={[{ id: place.id, latitude: google.location.latitude, longitude: google.location.longitude, title: google.name }]}
          height={180}
        />
      ) : null}
      {placeId ? (
        <Button
          label={t('places.directions')}
          icon="navigate"
          onPress={() => openUrl(googleMapsDirectionsUrl(placeId, google?.name ?? display.name))}
        />
      ) : (
        <Button
          label={t('tripDetail.openInMaps')}
          icon="map-outline"
          onPress={() => openInMaps(place.name ?? '', place.address)}
        />
      )}

      <ListGroup>
        <ListRow
          title={t('places.visited')}
          leading="checkmark-circle-outline"
          trailing={
            <Switch
              value={visited}
              disabled={update.isPending}
              onValueChange={(value) => update.mutate({ visited: value })}
              trackColor={{ true: colors.success, false: colors.surfaceMuted }}
              accessibilityLabel={t('places.markVisited')}
            />
          }
        />
      </ListGroup>

      <Section title={t('places.category')}>
        <CategoryChips
          options={PLACE_CATEGORIES.map((value) => ({ value }))}
          value={place.category}
          onChange={(category: PlaceCategory) => update.mutate({ category })}
        />
      </Section>

      {update.isError ? <InlineError message={errorMessage(update.error)} /> : null}

      <Section title={t('places.myNotes')}>
        <NotesTagsEditor
          key={place.version}
          notes={place.notes}
          tags={place.tags}
          saving={update.isPending}
          error={null}
          onSave={(notes, tags) => update.mutate({ notes, tags })}
        />
      </Section>

      {place.source === 'custom' ? (
        <Section title={t('placeForm.editTitle')}>
          <PlaceForm
            key={place.version}
            initial={{ name: place.name ?? '', address: place.address, notes: place.notes }}
            submitLabel={t('placeForm.saveChanges')}
            submitting={update.isPending}
            onSubmit={(values) => update.mutate({ name: values.name, address: values.address })}
            showNotes={false}
          />
        </Section>
      ) : null}

      <Section title={t('places.inTrips')}>
        <TripMembership placeId={place.id} />
      </Section>

    </>
  );
}

/** Header "…": the place's secondary actions (Google Maps, delete). */
function PlaceMenu({ place }: { place: Place }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const openMenu = useActionMenu();
  const display = usePlaceDisplay(place);
  const remove = useDeletePlace();
  const placeId = place.googlePlaceId;

  const confirmDelete = () => {
    Alert.alert(t('placeForm.deletePlaceTitle'), t('placeForm.deletePlaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(place.id, {
            onSuccess: () => router.back(),
            onError: (error) => Alert.alert(errorMessage(error)),
          }),
      },
    ]);
  };

  return (
    <IconButton
      icon="ellipsis-horizontal"
      accessibilityLabel={t('itinerary.moreFor', { name: display.name })}
      onPress={() =>
        openMenu({
          title: display.name,
          items: [
            {
              label: t('places.openInGoogleMapsLong'),
              icon: 'map-outline',
              hidden: !placeId,
              onPress: () =>
                placeId &&
                void Linking.openURL(display.google?.googleMapsUri ?? googleMapsPlaceUrl(placeId, display.name)).catch(
                  () => undefined,
                ),
            },
            { label: t('placeForm.deletePlace'), icon: 'trash-outline', destructive: true, onPress: confirmDelete },
          ],
        })
      }
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl },
  hero: { gap: spacing.sm },
});
