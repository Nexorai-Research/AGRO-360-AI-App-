import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { G8, askTraining, fetchCompletions, fetchTrainingItems, gkey } from './api-g8';

type Tab = 'ask' | 'items' | 'mine';

export default function TrainingG8Screen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('ask');
  const [text, setText] = useState('');
  const [asked, setAsked] = useState('');
  const [tried, setTried] = useState(false);
  const on = s.ready && s.can(G8.assistant);
  const items = useQuery({
    queryKey: gkey(s.userId, 'items'),
    queryFn: ({ signal }) => fetchTrainingItems(s.client!, signal),
    enabled: on && tab === 'items',
    retry: retryNetworkOnce,
  });
  const mine = useQuery({
    queryKey: gkey(s.userId, 'completions'),
    queryFn: ({ signal }) => fetchCompletions(s.client!, signal),
    enabled: on && tab === 'mine',
    retry: retryNetworkOnce,
  });
  const ans = useQuery({
    queryKey: gkey(s.userId, 'ask', asked),
    queryFn: ({ signal }) => askTraining(s.client!, asked, signal),
    enabled: on && tab === 'ask' && asked !== '',
    retry: retryNetworkOnce,
  });
  if (!s.can(G8.assistant)) return <StateView state="denied" message={t('ai.denied')} />;
  const badQ = text.trim().length < 2 || text.length > 300;
  const active = tab === 'items' ? items : mine;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        tab === 'ask' ? undefined : (
          <RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />
        )
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiTraining') }} />
      <Text style={k.title}>{t('ai.tr.title')}</Text>
      <Chips
        options={(['ask', 'items', 'mine'] as const).map((x) => ({ value: x, label: t(`ai.tr.tab.${x}`) }))}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />
      {tab === 'ask' ? (
        <>
          <Field
            label={t('ai.tr.question')}
            value={text}
            onChange={setText}
            error={tried && badQ ? t('ai.tr.bad') : null}
          />
          <Button
            label={t('ai.tr.ask')}
            onPress={() => (setTried(true), badQ ? undefined : setAsked(text.trim()))}
          />
          {asked ? (
            <Gate q={ans} ns="ai" emptyKey="ai.tr.none" isEmpty={false}>
              {ans.data ? (
                <>
                  {!ans.data.found ? <Text style={k.warn}>{ans.data.message}</Text> : null}
                  {ans.data.passages.map((p, i) => (
                    <View key={`${p.itemId}-${i}`} style={k.card}>
                      <Text style={k.name}>{p.title}</Text>
                      <Text style={k.sub}>{p.text}</Text>
                      <Text style={k.sub}>{t('ai.tr.from', { source: p.source, version: p.version })}</Text>
                    </View>
                  ))}
                  {ans.data.summary ? (
                    <Text style={k.sub}>{`${ans.data.summary} (${ans.data.summaryNote ?? ''})`}</Text>
                  ) : null}
                </>
              ) : null}
            </Gate>
          ) : null}
        </>
      ) : null}
      {tab === 'items' ? (
        <Gate q={items} ns="ai" emptyKey="ai.tr.noItems" isEmpty={(items.data ?? []).length === 0}>
          {(items.data ?? []).map((i) => (
            <View key={i.id} style={k.card}>
              <Text style={k.name}>{i.title}</Text>
              <Text
                style={k.sub}
              >{`${i.category} · ${t('ai.tr.from', { source: i.source, version: i.version })}`}</Text>
              <Text style={k.sub} numberOfLines={4}>
                {i.body}
              </Text>
              <Button
                kind="ghost"
                label={t('ai.tr.quiz')}
                onPress={() => router.push({ pathname: '/ai-training-quiz', params: { id: i.id } } as never)}
              />
            </View>
          ))}
        </Gate>
      ) : null}
      {tab === 'mine' ? (
        <Gate q={mine} ns="ai" emptyKey="ai.tr.noMine" isEmpty={(mine.data ?? []).length === 0}>
          {(mine.data ?? []).map((c) => (
            <View key={c.id} style={k.card}>
              <Text style={k.name}>{c.title}</Text>
              <Text
                style={c.passed ? k.ok : k.warn}
              >{`${c.score}/${c.total} · ${c.passed ? t('ai.tr.passed') : t('ai.tr.notPassed')}`}</Text>
              <Text style={k.sub}>{c.completedAt.slice(0, 10)}</Text>
            </View>
          ))}
        </Gate>
      ) : null}
    </ScrollView>
  );
}
