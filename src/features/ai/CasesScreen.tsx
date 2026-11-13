import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey } from './api';
import { G4P, answerCase, fetchCases } from './api-g4';

export default function CasesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const qc = useQueryClient();
  const key = useActionKey();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const ok = s.ready && s.can(AP.digest);
  const q = useQuery({
    queryKey: akey(s.userId, 'cases', filter),
    queryFn: ({ signal }) => fetchCases(s.client!, filter, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const items = q.data ?? [];
  const valid = text.trim().length >= 3;
  function send(id: string) {
    if (!valid) return;
    void s.act(
      t('ai.cs.sent'),
      () => answerCase(s.client!, id, text.trim(), key.keyFor(`${id}|${text.trim()}`)),
      () => {
        key.reset();
        setText('');
        setOpen(null);
        void qc.invalidateQueries({ queryKey: ['ai', 'cases'] });
      },
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiCases') }} />
      <Text style={k.title}>{t('ai.cs.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Chips
        options={['', 'REQUESTED', 'ANSWERED'].map((x) => ({ value: x, label: t(`ai.cs.f.${x || 'ALL'}`) }))}
        value={filter}
        onChange={setFilter}
      />
      <Gate q={q} ns="ai" emptyKey="ai.cs.none" isEmpty={items.length === 0}>
        {items.map((c) => (
          <View key={c.id} style={k.card}>
            <Text style={k.name}>
              {c.crop}
              {c.stage ? ` · ${c.stage}` : ''}
            </Text>
            <Text style={k.sub}>
              {t(`ai.cs.via.${c.via}`)} · {t(`ai.cs.esc.${c.escalation}`)} · {c.createdAt.slice(0, 10)}
            </Text>
            {c.symptomsText ? <Text style={k.sub}>{c.symptomsText}</Text> : null}
            {c.escalatedNote ? (
              <Text style={k.sub}>{t('ai.cs.asked', { note: c.escalatedNote })}</Text>
            ) : null}
            {c.expertAnswer ? <Text style={k.ok}>{t('ai.cs.answer', { text: c.expertAnswer })}</Text> : null}
            {c.escalation === 'REQUESTED' && s.can(G4P.expert) ? (
              open === c.id ? (
                <>
                  <Field
                    label={t('ai.cs.write')}
                    value={text}
                    onChange={setText}
                    multiline
                    error={text !== '' && !valid ? t('ai.cs.short') : null}
                  />
                  <Button label={t('ai.cs.send')} disabled={s.busy || !valid} onPress={() => send(c.id)} />
                </>
              ) : (
                <Button kind="ghost" label={t('ai.cs.reply')} onPress={() => setOpen(c.id)} />
              )
            ) : null}
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}
