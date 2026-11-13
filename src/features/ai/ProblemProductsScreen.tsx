import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, fetchProblemProducts } from './api';
import { units } from './fmt';

export default function ProblemProductsScreen() {
  const { t } = useTranslation();
  const {
    id,
    branch,
    case: caseId,
    name,
  } = useLocalSearchParams<{ id: string; branch: string; case?: string; name?: string }>();
  const s = useSal();
  const ok = s.ready && s.can(AP.digest) && !!id && !!branch;
  const q = useQuery({
    queryKey: akey(s.userId, 'problem-products', `${id}|${branch}`),
    queryFn: ({ signal }) => fetchProblemProducts(s.client!, id!, branch!, caseId ?? '', signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiCropDoctor') }} />
      <Text style={k.title}>{t('ai.pp.title', { name: name ?? '' })}</Text>
      <Gate q={q} ns="ai" emptyKey="ai.pp.none" isEmpty={false}>
        {d ? (
          <>
            <Text style={k.warn}>{d.staffOnly}</Text>
            {d.note ? <Text style={k.sub}>{d.note}</Text> : null}
            {d.products.map((p) => (
              <View key={p.skuId} style={k.card}>
                <Text style={k.name}>{p.name}</Text>
                <Text style={k.sub}>
                  {p.code} · {t('ai.pp.stock', { n: units(p.stockQty) })}
                </Text>
                <Text style={k.sub}>{t('ai.pp.matches', { list: p.matchedIngredients.join(', ') })}</Text>
              </View>
            ))}
            {d.excluded.length > 0 ? (
              <View style={k.card}>
                <Text style={k.name}>{t('ai.pp.excluded')}</Text>
                {d.excluded.map((x) => (
                  <Text key={x.code} style={k.sub}>
                    {x.name} ({x.code}): {x.reason}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={k.sub}>{d.disclaimer}</Text>
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}
