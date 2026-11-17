import {
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  PLACE_CATEGORIES,
  type Place,
  type PlaceCategory,
} from '@travel-companion/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { googleMapsEnabled, PlacesMap } from '@/components/maps/PlacesMap';
import { AppText, Button, ErrorState, Icon, InlineError, LoadingState, NavHeader, Section } from '@/components/ui';
import { CategoryChips } from '@/features/places/CategoryChips';
import { CATEGORY_ICONS } from '@/features/places/categories';
import { NotesTagsEditor } from '@/features/places/NotesTagsEditor';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceForm } from '@/features/places/PlaceForm';
import { useDeletePlace, usePlace, useUpdatePlace } from '@/features/places/queries';
import { TripMembership } from '@/features/places/TripMembership';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';

export default function PlaceScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const place = usePlace(id);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader />
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
  const remove = useDeletePlace();
  const visited = place.visitedAt !== null;
  const google = display.google;
  const placeId = place.googlePlaceId;

  const openUrl = (url: string) => void Linking.openURL(url).catch(() => undefined);

  const confirmDelete = () => {
    Alert.alert(t('placeForm.deletePlaceTitle'), t('placeForm.deletePlaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(place.id, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.categoryPill}>
          <Icon name={CATEGORY_ICONS[place.category]} size={14} color={colors.accent} />
          <AppText variant="caption" color="accent" style={styles.bold}>
            {display.typeLabel ?? t(`categories.${place.category}`)}
          </AppText>
        </View>
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
      <View style={styles.actionsRow}>
        {placeId ? (
          <>
            <View style={styles.flex}>
              <Button
                label={t('places.directions')}
                icon="navigate"
                onPress={() => openUrl(googleMapsDirectionsUrl(placeId, google?.name ?? display.name))}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={t('places.openInGoogleMaps')}
                icon="map-outline"
                variant="secondary"
                onPress={() => openUrl(google?.googleMapsUri ?? googleMapsPlaceUrl(placeId, display.name))}
              />
            </View>
          </>
        ) : (
          <View style={styles.flex}>
            <Button
              label={t('tripDetail.openInMaps')}
              icon="map-outline"
              variant="secondary"
              onPress={() => openInMaps(place.name ?? '', place.address)}
            />
          </View>
        )}
      </View>

      {/* Visited */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: visited, busy: update.isPending }}
        onPress={() => update.mutate({ visited: !visited })}
        style={[styles.visited, visited && styles.visitedOn]}
      >
        <Icon
          name={visited ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={visited ? colors.textOnAccent : colors.textTertiary}
        />
        <AppText variant="bodyStrong" style={visited ? styles.visitedText : undefined}>
          {visited ? t('places.visited') : t('places.markVisited')}
        </AppText>
      </Pressable>

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

      <View style={styles.danger}>
        {remove.isError ? <InlineError message={errorMessage(remove.error)} /> : null}
        <Button
          label={t('placeForm.deletePlace')}
          icon="trash-outline"
          variant="danger"
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl },
  hero: { gap: spacing.sm },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  bold: { fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  visited: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  visitedOn: { backgroundColor: colors.success, borderColor: colors.success },
  visitedText: { color: colors.textOnAccent },
  danger: { marginTop: spacing.lg },
});
