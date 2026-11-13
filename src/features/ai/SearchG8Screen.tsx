import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { G8, gkey, searchProducts } from './api-g8';

export default function SearchG8Screen() {
  const { t } = useTranslation();
  const s = useSal();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  const allowed = s.can(G8.productView);
  const r = useQuery({
    queryKey: gkey(s.userId, 'search', q),
    queryFn: ({ signal }) => searchProducts(s.client!, q, signal),
    enabled: s.ready && allowed && q.length >= 2,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiSearch') }} />
      <Text style={k.title}>{t('ai.sr.title')}</Text>
      <Text style={k.sub}>{t('ai.sr.intro')}</Text>
      <Field label={t('ai.sr.box')} value={text} onChange={setText} />
      {q.length >= 2 ? (
        <Gate q={r} ns="ai" emptyKey="ai.sr.none" isEmpty={(r.data?.items ?? []).length === 0}>
          {(r.data?.items ?? []).map((h) => (
            <View key={h.id} style={k.card}>
              <Text style={k.name}>{h.name}</Text>
              <Text style={k.sub}>
                {[h.code, h.localName, h.brand, h.category].filter(Boolean).join(' · ')}
              </Text>
              <Text style={k.sub}>{t('ai.sr.because', { list: h.because.join(', ') })}</Text>
            </View>
          ))}
        </Gate>
      ) : null}
    </ScrollView>
  );
}
