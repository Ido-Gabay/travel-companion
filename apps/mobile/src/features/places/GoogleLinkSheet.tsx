import type { DiscoverResult, PlaceCategory } from '@travel-companion/shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet } from '@/components/ui';
import { useDiscoverSearch } from '@/features/discover/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing, typography, weights } from '@/theme/tokens';
import { CATEGORY_ICONS } from './categories';
import { usePrimeGooglePlaces } from './queries';

/**
 * "Link to Google Maps" for a place saved by name (typed or imported): the
 * same search-and-pick as pinning a hotel. One Google search, only when the
 * user taps Search; picking a result hands it back (the caller saves it).
 */
export function GoogleLinkSheet({
  visible,
  name,
  query: initial,
  near,
  category,
  busy = false,
  error = null,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The place being linked, as the user named it. */
  name: string;
  /** What to search for first (the name, plus an area the user gave). */
  query: string;
  /** The trip's destination, to search near. */
  near: string | null;
  category: PlaceCategory;
  busy?: boolean;
  error?: string | null;
  onPick: (result: DiscoverResult) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const errorMessage = useErrorMessage();
  const search = useDiscoverSearch();
  const prime = usePrimeGooglePlaces();
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const run = () => {
    const text = query.trim();
    if (!text) return;
    search.mutate(
      { plan: { textQuery: text, includedType: null, openNow: false, category }, ...(near ? { area: { kind: 'near', text: near } } : {}) },
      {
        onSuccess: (response) => {
          prime(response.results);
          setResults(response.results);
        },
      },
    );
  };

  return (
    <Sheet visible={visible} title={t('googleLink.title')} subtitle={name} onClose={onClose}>
      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('googleLink.placeholder')}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { textAlign: isRtl ? 'right' : 'left' }]}
          returnKeyType="search"
          onSubmitEditing={run}
          accessibilityLabel={t('googleLink.placeholder')}
        />
        {search.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
      <Button
        label={t('googleLink.search')}
        icon="search"
        variant="secondary"
        onPress={run}
        disabled={!query.trim() || search.isPending}
      />
      {results === null ? (
        <AppText variant="caption" color="tertiary">
          {t('googleLink.hint')}
        </AppText>
      ) : null}
      {search.isError ? <InlineError message={errorMessage(search.error)} /> : null}
      {error ? <InlineError message={error} /> : null}
      {results?.length === 0 ? (
        <AppText variant="body" color="secondary">
          {t('discover.noResults')}
        </AppText>
      ) : null}
      {results && results.length > 0 ? (
        <>
          <GoogleAttribution />
          {results.map((result) => (
            <Pressable
              key={result.placeId}
              accessibilityRole="button"
              accessibilityLabel={result.name}
              accessibilityHint={t('googleLink.pickHint')}
              onPress={() => {
                setPicked(result.placeId);
                onPick(result);
              }}
              disabled={busy}
              style={({ pressed }) => [styles.result, pressed && styles.pressed]}
            >
              <Icon name={CATEGORY_ICONS[result.category ?? category]} size={20} color={colors.accent} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {result.name}
                </AppText>
                <AppText variant="caption" color="secondary" numberOfLines={2}>
                  {[result.typeLabel, result.address].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              {busy && picked === result.placeId ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <AppText variant="caption" color="accent" style={styles.bold}>
                  {t('googleLink.pick')}
                </AppText>
              )}
            </Pressable>
          ))}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: weights.semibold },
  pressed: { opacity: 0.7 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { ...typography.body, flex: 1, minHeight: 48, color: colors.text },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
