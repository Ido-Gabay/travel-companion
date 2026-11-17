import { PLACE_LABEL_MAX, type Place } from '@travel-companion/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, ListGroup, ListRow, Sheet, TextField } from '@/components/ui';
import { useErrorMessage } from '@/lib/use-error-message';
import { useUpdatePlace } from './queries';

/**
 * The user's own label for a place (M12a). Typed by the user only: the field
 * starts with their current label or empty, never with Google's name.
 */
export function LabelEditor({ place }: { place: Place }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdatePlace(place.id);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(place.myLabel ?? '');
  const trimmed = value.trim();
  const changed = (trimmed || null) !== place.myLabel;

  const save = () =>
    update.mutate({ myLabel: trimmed === '' ? null : trimmed }, { onSuccess: () => setOpen(false) });

  return (
    <>
      <ListGroup footer={t('places.labelHint')}>
        <ListRow
          title={t('places.label')}
          leading="pricetag-outline"
          value={place.myLabel ?? t('common.notSet')}
          onPress={() => {
            setValue(place.myLabel ?? '');
            setOpen(true);
          }}
        />
      </ListGroup>
      <Sheet
        visible={open}
        title={t('places.label')}
        subtitle={t('places.labelHint')}
        onClose={() => setOpen(false)}
        footer={<Button label={t('common.save')} onPress={save} loading={update.isPending} disabled={!changed} />}
      >
        <TextField
          label={t('places.label')}
          placeholder={t('places.labelPlaceholder')}
          value={value}
          onChangeText={setValue}
          maxLength={PLACE_LABEL_MAX}
          returnKeyType="done"
          onSubmitEditing={() => changed && save()}
        />
        {update.isError ? <InlineError message={errorMessage(update.error)} /> : null}
      </Sheet>
    </>
  );
}
