import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText, Button, ErrorState, LoadingState, NavHeader } from '@/components/ui';
import { openInMaps } from '@/features/places/open-in-maps';
import { PlaceForm } from '@/features/places/PlaceForm';
import { useDeletePlace, usePlace, useUpdatePlace } from '@/features/places/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, spacing } from '@/theme/tokens';

export default function PlaceScreen() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const place = usePlace(id);
  const updatePlace = useUpdatePlace(id);
  const deletePlace = useDeletePlace();

  const confirmDelete = () => {
    Alert.alert(t('placeForm.deletePlaceTitle'), t('placeForm.deletePlaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deletePlace.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('placeForm.editTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {place.isPending ? (
            <LoadingState />
          ) : place.isError ? (
            <ErrorState message={errorMessage(place.error)} onRetry={() => void place.refetch()} />
          ) : (
            <>
              {/* Keyed by version so the form resets after a save. */}
              <PlaceForm
                key={place.data.version}
                initial={{ name: place.data.name, address: place.data.address, notes: place.data.notes }}
                submitLabel={t('placeForm.saveChanges')}
                submitting={updatePlace.isPending}
                error={updatePlace.isError ? errorMessage(updatePlace.error) : null}
                onSubmit={(values) => updatePlace.mutate(values)}
              />
              <Button
                label={t('tripDetail.openInMaps')}
                icon="map-outline"
                variant="secondary"
                onPress={() => openInMaps(place.data.name, place.data.address)}
              />
              {place.data.tripCount > 0 ? (
                <AppText variant="caption" color="secondary" align="center">
                  {t('places.tripCount', { count: place.data.tripCount })}
                </AppText>
              ) : null}
              <View style={styles.danger}>
                {deletePlace.isError ? (
                  <AppText variant="caption" color="danger" align="center">
                    {errorMessage(deletePlace.error)}
                  </AppText>
                ) : null}
                <Button
                  label={t('placeForm.deletePlace')}
                  icon="trash-outline"
                  variant="danger"
                  loading={deletePlace.isPending}
                  onPress={confirmDelete}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },
  danger: { marginTop: spacing.xxl, gap: spacing.sm },
});
