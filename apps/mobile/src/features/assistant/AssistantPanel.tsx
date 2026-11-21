import type { AssistantInstruction, TripAssistantRequest } from '@travel-companion/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, TextField } from '@/components/ui';
import { getConnection } from '@/features/offline/connection';
import { dayTitle } from '@/features/trips/itinerary';
import { useLocale } from '@/i18n/LocaleProvider';
import { api } from '@/lib/api';
import { colors, radii, spacing } from '@/theme/tokens';
import { readRequest, type Picks } from './rules';

export interface AssistantResult {
  message: string;
  instructions: AssistantInstruction[];
  /** "rules": understood on the phone (free); "ai": the AI read it. */
  source: 'rules' | 'ai';
  summary: string;
  refs: ReadonlyMap<string, string>;
}

type Pending =
  | { kind: 'pickDay'; message: string; weekday: number; days: string[]; picks: Picks }
  | { kind: 'clarify'; message: string; question: string; options: string[]; context: TripAssistantRequest['context']; refs: ReadonlyMap<string, string> };

type Status = 'idle' | 'thinking' | 'unavailable' | 'offline' | 'error';

/**
 * D1 trip assistant: "tell the planner what you want". The phone reads the
 * common requests itself (free, works offline); only what it can't read goes
 * to the AI, once per request. Its answer becomes a proposal below; nothing
 * changes until the user applies it.
 */
export function AssistantPanel({
  days,
  today,
  buildContext,
  onResult,
  examples,
}: {
  days: readonly string[];
  today: string | null;
  buildContext: () => { context: TripAssistantRequest['context']; refs: ReadonlyMap<string, string> };
  onResult: (result: AssistantResult) => void;
  examples?: string;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useMutation({ mutationFn: (body: TripAssistantRequest) => api.tripAssistant(body) });

  const askAi = (message: string, context: TripAssistantRequest['context'], refs: ReadonlyMap<string, string>, clarification?: { question: string; answer: string }) => {
    if (getConnection() === 'offline') {
      setStatus('offline');
      return;
    }
    setStatus('thinking');
    ask.mutate(
      { message, locale, context, ...(clarification ? { clarifications: [clarification] } : {}) },
      {
        onSuccess: (response) => {
          if (response.action === 'plan') {
            setStatus('idle');
            setPending(null);
            setText('');
            onResult({ message, instructions: response.instructions, source: 'ai', summary: response.summary, refs });
          } else if (response.action === 'clarify') {
            setStatus('idle');
            setPending({ kind: 'clarify', message, question: response.question, options: response.options, context, refs });
          } else {
            setStatus('unavailable');
          }
        },
        onError: () => setStatus('error'),
      },
    );
  };

  const send = (message: string, picks: Picks = {}) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setPending(null);
    const read = readRequest(trimmed, days, today, picks);
    if (read?.kind === 'plan') {
      setStatus('idle');
      setText('');
      onResult({ message: trimmed, instructions: read.instructions, source: 'rules', summary: '', refs: new Map() });
      return;
    }
    if (read?.kind === 'pickDay') {
      setPending({ kind: 'pickDay', message: trimmed, weekday: read.weekday, days: read.days, picks });
      return;
    }
    const { context, refs } = buildContext();
    askAi(trimmed, context, refs);
  };

  const answer = (value: string) => {
    if (!pending) return;
    if (pending.kind === 'pickDay') send(pending.message, { ...pending.picks, [pending.weekday]: value });
    else askAi(pending.message, pending.context, pending.refs, { question: pending.question, answer: value });
  };

  return (
    <View style={styles.panel}>
      <TextField
        label={t('assistant.label')}
        placeholder={t('assistant.placeholder')}
        value={text}
        onChangeText={setText}
        returnKeyType="send"
        onSubmitEditing={() => (pending?.kind === 'clarify' ? answer(text) : send(text))}
        maxLength={300}
        editable={status !== 'thinking'}
      />
      <View style={styles.row}>
        {status === 'thinking' ? <ActivityIndicator color={colors.accent} /> : null}
        <AppText variant="caption" color="tertiary" style={styles.flex}>
          {status === 'thinking'
            ? t('assistant.thinking')
            : status === 'unavailable'
              ? t('assistant.unavailable')
              : status === 'offline'
                ? t('assistant.offline')
                : status === 'error'
                  ? t('assistant.error')
                  : (examples ?? t('assistant.examples'))}
        </AppText>
        <Button
          label={pending?.kind === 'clarify' ? t('assistant.answer') : t('assistant.send')}
          size="sm"
          block={false}
          disabled={!text.trim() || status === 'thinking'}
          onPress={() => (pending?.kind === 'clarify' ? answer(text) : send(text))}
        />
      </View>
      {pending ? (
        <View style={styles.question}>
          <AppText variant="bodyStrong">
            {pending.kind === 'pickDay' ? t('assistant.whichDay') : pending.question}
          </AppText>
          <View style={styles.options}>
            {(pending.kind === 'pickDay' ? pending.days : pending.options).map((option) => (
              <Button
                key={option}
                label={pending.kind === 'pickDay' ? dayTitle(option, locale) : option}
                variant="secondary"
                size="sm"
                block={false}
                onPress={() => answer(option)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  question: { gap: spacing.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
