import {
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  PLACE_CATEGORIES,
  type Place,
  type PlaceCategory,
} from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
import { LabelEditor } from '@/features/places/LabelEditor';
import { NotesTagsEditor } from '@/features/places/NotesTagsEditor';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceForm } from '@/features/places/PlaceForm';
import { CustomPinSection, OwnPinSheet } from '@/features/places/PlacePinSection';
import { VisitHistory } from '@/features/places/VisitHistory';
import { useDeletePlace, useLinkGooglePlace, usePlace, useSetVisited, useUpdatePlace } from '@/features/places/queries';
import { GoogleLinkSheet } from '@/features/places/GoogleLinkSheet';
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
          {place.data ? (
            <PlaceDetail place={place.data} />
          ) : place.isPending ? (
            <LoadingState />
          ) : (
            <ErrorState message={errorMessage(place.error)} onRetry={() => void place.refetch()} />
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
  const setVisited = useSetVisited();
  const visited = place.visitedAt !== null;
  const google = display.google;
  const placeId = place.googlePlaceId;
  const [more, setMore] = useState(false);
  const [linking, setLinking] = useState(false);
  const link = useLinkGooglePlace();

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
      ) : place.latitude == null ? (
        <Button
          label={t('tripDetail.openInMaps')}
          icon="map-outline"
          onPress={() => openInMaps(place.name ?? '', place.address)}
        />
      ) : null}
      {/* Saved by name only (typed or imported): find it on Google Maps, on tap. */}
      {place.source === 'custom' && place.latitude == null && !place.linkedGooglePlaceId ? (
        <>
          <Button label={t('googleLink.action')} icon="location-outline" variant="secondary" onPress={() => setLinking(true)} />
          {linking ? (
            <GoogleLinkSheet
              visible
              name={display.name}
              query={[place.name, place.address].filter(Boolean).join(' ')}
              near={null}
              category={place.category}
              busy={link.isPending}
              error={link.isError ? errorMessage(link.error) : null}
              onPick={(result) =>
                link.mutate(
                  { placeId: place.id, googlePlaceId: result.placeId },
                  {
                    onSuccess: (linked) => {
                      setLinking(false);
                      if (linked.id !== place.id) router.replace({ pathname: '/places/[id]', params: { id: linked.id } });
                    },
                  },
                )
              }
              onClose={() => setLinking(false)}
            />
          ) : null}
        </>
      ) : null}
      {place.source === 'custom' ? <CustomPinSection place={place} /> : null}

      <Section title={t('places.inTrips')}>
        <TripMembership placeId={place.id} />
      </Section>

      <Section title={t('visits.history')}>
        <VisitHistory placeId={place.id} />
        <ListGroup>
          <ListRow
            title={t('places.visited')}
            leading="checkmark-circle-outline"
            trailing={
              <Switch
                value={visited}
                onValueChange={(value) => setVisited.mutate({ id: place.id, visited: value })}
                trackColor={{ true: colors.success, false: colors.surfaceMuted }}
                accessibilityLabel={t('places.markVisited')}
              />
            }
          />
        </ListGroup>
      </Section>

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

      {update.isError ? <InlineError message={errorMessage(update.error)} /> : null}

      {/* Rarely changed after saving: the offline label, the category and (own places) name and address. */}
      <Button
        label={more ? t('places.lessDetails') : t('places.moreDetails')}
        icon={more ? 'chevron-up' : 'chevron-down'}
        variant="ghost"
        size="sm"
        block={false}
        onPress={() => setMore((value) => !value)}
      />
      {more ? (
        <>
          <LabelEditor key={place.myLabel ?? ''} place={place} />

          <Section title={t('places.category')}>
            <CategoryChips
              options={PLACE_CATEGORIES.map((value) => ({ value }))}
              value={place.category}
              onChange={(category: PlaceCategory) => update.mutate({ category })}
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
        </>
      ) : null}
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
  const [ownPin, setOwnPin] = useState(false);

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
    <>
    <OwnPinSheet place={place} visible={ownPin} onClose={() => setOwnPin(false)} />
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
            { label: t('pin.ownTitle'), icon: 'location-outline', hidden: !placeId, onPress: () => setOwnPin(true) },
            { label: t('placeForm.deletePlace'), icon: 'trash-outline', destructive: true, onPress: confirmDelete },
          ],
        })
      }
    />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl },
  hero: { gap: spacing.sm },
});
