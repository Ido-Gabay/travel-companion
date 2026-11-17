import { createPlaceSchema, PLACE_ADDRESS_MAX, PLACE_NAME_MAX, PLACE_NOTES_MAX } from '@travel-companion/shared';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, TextField, type TextFieldHandle } from '@/components/ui';
import { spacing } from '@/theme/tokens';

export interface PlaceFormValues {
  name: string;
  address: string | null;
  notes: string | null;
}

interface PlaceFormProps {
  initial?: PlaceFormValues;
  submitLabel: string;
  submitting: boolean;
  /** Translated error from the last save attempt, if any. */
  error?: string | null;
  onSubmit: (values: PlaceFormValues) => void;
}

/** Name, address/area and free-form notes. Validated with the shared schema. */
export function PlaceForm({ initial, submitLabel, submitting, error, onSubmit }: PlaceFormProps) {
  const { t } = useTranslation();
  const addressRef = useRef<TextFieldHandle>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  const changed =
    !initial ||
    name.trim() !== initial.name ||
    (address.trim() || null) !== initial.address ||
    (notes.trim() || null) !== initial.notes;

  const submit = () => {
    const parsed = createPlaceSchema.safeParse({ name, address, notes });
    if (!parsed.success) {
      setNameError(name.trim() ? null : t('placeForm.nameRequired'));
      return;
    }
    setNameError(null);
    onSubmit(parsed.data);
  };

  return (
    <View style={styles.form}>
      <TextField
        label={t('placeForm.name')}
        placeholder={t('placeForm.namePlaceholder')}
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (nameError) setNameError(null);
        }}
        error={nameError}
        maxLength={PLACE_NAME_MAX}
        autoFocus={!initial}
        returnKeyType="next"
        onSubmitEditing={() => addressRef.current?.focus()}
      />
      <TextField
        ref={addressRef}
        label={t('placeForm.address')}
        placeholder={t('placeForm.addressPlaceholder')}
        value={address}
        onChangeText={setAddress}
        maxLength={PLACE_ADDRESS_MAX}
        textContentType="fullStreetAddress"
        returnKeyType="next"
      />
      <TextField
        label={t('placeForm.notes')}
        placeholder={t('placeForm.notesPlaceholder')}
        value={notes}
        onChangeText={setNotes}
        maxLength={PLACE_NOTES_MAX}
        multiline
      />
      {error ? <InlineError message={error} /> : null}
      <Button
        label={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={!name.trim() || !changed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl },
});
