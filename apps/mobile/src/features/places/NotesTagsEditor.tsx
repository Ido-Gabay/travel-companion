import { PLACE_NOTES_MAX, PLACE_TAG_MAX, PLACE_TAGS_MAX, placeTagsSchema } from '@travel-companion/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Icon, InlineError, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme/tokens';

interface NotesTagsEditorProps {
  notes: string | null;
  tags: string[];
  saving: boolean;
  error: string | null;
  onSave: (notes: string | null, tags: string[]) => void;
}

/** The user's own notes and tags for a place. */
export function NotesTagsEditor({ notes: initialNotes, tags: initialTags, saving, error, onSave }: NotesTagsEditorProps) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [tags, setTags] = useState(initialTags);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const parsed = placeTagsSchema.safeParse([...tags, tagInput]);
    if (parsed.success) setTags(parsed.data);
    setTagInput('');
  };

  const changed =
    (notes.trim() || null) !== initialNotes || JSON.stringify(tags) !== JSON.stringify(initialTags);

  return (
    <View style={styles.editor}>
      <TextField
        label={t('placeForm.notes')}
        placeholder={t('placeForm.notesPlaceholder')}
        value={notes}
        onChangeText={setNotes}
        maxLength={PLACE_NOTES_MAX}
        multiline
      />
      <View style={styles.tagsBlock}>
        <AppText variant="caption" color="secondary" style={styles.label}>
          {t('places.tags')}
        </AppText>
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={t('places.removeTag', { tag })}
                onPress={() => setTags(tags.filter((item) => item !== tag))}
                style={styles.tag}
              >
                <AppText variant="caption" style={styles.tagText}>
                  {tag}
                </AppText>
                <Icon name="close" size={13} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {tags.length < PLACE_TAGS_MAX ? (
          <TextField
            label={t('places.addTag')}
            placeholder={t('places.tagPlaceholder')}
            value={tagInput}
            onChangeText={setTagInput}
            maxLength={PLACE_TAG_MAX}
            returnKeyType="done"
            onSubmitEditing={addTag}
            blurOnSubmit={false}
          />
        ) : null}
      </View>
      {error ? <InlineError message={error} /> : null}
      <Button
        label={t('placeForm.saveChanges')}
        variant="secondary"
        onPress={() => onSave(notes.trim() || null, tags)}
        loading={saving}
        disabled={!changed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: spacing.lg },
  tagsBlock: { gap: spacing.sm },
  label: { fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  tagText: { color: colors.accent, fontWeight: '600' },
});
