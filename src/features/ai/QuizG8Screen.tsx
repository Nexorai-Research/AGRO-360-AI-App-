import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { G8, fetchQuiz, gkey, submitQuiz, type Completion } from './api-g8';

export default function QuizG8Screen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSal();
  const key = useActionKey();
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Completion | null>(null);
  const q = useQuery({
    queryKey: gkey(s.userId, 'quiz', id),
    queryFn: ({ signal }) => fetchQuiz(s.client!, id!, signal),
    enabled: s.ready && s.can(G8.assistant) && !!id,
    retry: retryNetworkOnce,
  });
  if (!s.can(G8.assistant)) return <StateView state="denied" message={t('ai.denied')} />;
  const qs = q.data?.questions ?? [];
  const all = qs.length > 0 && qs.every((x) => picked[x.id] !== undefined);
  function send() {
    const answers = qs.map((x) => ({ id: x.id, option: picked[x.id]! }));
    void s.act(
      t('ai.tr.sent'),
      async () => setResult(await submitQuiz(s.client!, id!, answers, key.keyFor(JSON.stringify(answers)))),
      () => key.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page}>
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiTraining') }} />
      <Text style={k.title}>{q.data?.title ?? t('ai.tr.quiz')}</Text>
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={q} ns="ai" emptyKey="ai.tr.noQuiz" isEmpty={false}>
        {q.data?.message ? <Text style={k.warn}>{q.data.message}</Text> : null}
        {qs.map((x, n) => (
          <View key={x.id} style={k.card}>
            <Text style={k.name}>{`${n + 1}. ${x.prompt}`}</Text>
            <Chips
              options={x.options.map((o, i) => ({ value: String(i), label: o }))}
              value={picked[x.id] === undefined ? '' : String(picked[x.id])}
              onChange={(v) => !result && setPicked({ ...picked, [x.id]: Number(v) })}
            />
          </View>
        ))}
        {result ? (
          <Text
            style={result.passed ? k.ok : k.warn}
          >{`${result.score}/${result.total} · ${result.passed ? t('ai.tr.passed') : t('ai.tr.notPassed')}`}</Text>
        ) : qs.length > 0 ? (
          <Button label={t('ai.tr.submit')} disabled={s.busy || !all} onPress={send} />
        ) : null}
      </Gate>
    </ScrollView>
  );
}
