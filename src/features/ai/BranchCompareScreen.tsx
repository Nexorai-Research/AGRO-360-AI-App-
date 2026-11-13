import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, type ProductRef } from './api';
import { fetchTransferPlan } from './api-g5';
import { rupee, units } from './fmt';
import { ProductPicker } from './ProductPicker';

export default function BranchCompareScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [product, setProduct] = useState<ProductRef | null>(null);
  const allowed = s.can(AP.digest) && s.can('inventory.view');
  const q = useQuery({
    queryKey: akey(s.userId, 'transfer-plan', product?.id ?? ''),
    queryFn: ({ signal }) => fetchTransferPlan(s.client!, product!.id, signal),
    enabled: s.ready && allowed && !!product,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiBranchCompare') }} />
      <Text style={k.title}>{t('ai.bc.title')}</Text>
      <Text style={k.sub}>{t('ai.bc.intro')}</Text>
      <ProductPicker value={product} onPick={setProduct} />
      {product ? (
        <Gate q={q} ns="ai" emptyKey="ai.bc.none" isEmpty={false}>
          {d && d.state !== 'OK' ? (
            <Text style={k.warn}>{t('ai.fc.insufficient', { reason: d.reason ?? '-' })}</Text>
          ) : null}
          {d?.state === 'OK' ? (
            <>
              {d.branches.map((b) => (
                <View key={b.branchId} style={k.card}>
                  <Text style={k.name}>{b.branchName}</Text>
                  <Text style={b.status === 'SHORT' ? k.warn : k.sub}>
                    {t(`ai.bc.st.${b.status}`)} · {t('ai.bc.free', { n: units(b.free) })}
                    {b.coverDays !== null ? ` · ${t('ai.bc.cover', { n: units(b.coverDays) })}` : ''}
                  </Text>
                </View>
              ))}
              {d.transfers.length === 0 ? <Text style={k.sub}>{t('ai.bc.noMoves')}</Text> : null}
              {d.transfers.map((x) => (
                <View key={`${x.fromBranchId}-${x.toBranchId}`} style={k.card}>
                  <Text style={k.name}>
                    {t('ai.bc.move', { n: units(x.quantity), from: x.fromBranchName, to: x.toBranchName })}
                  </Text>
                  <Text style={k.sub}>{x.reason}</Text>
                  <Text style={k.sub}>
                    {x.cost?.total != null
                      ? t('ai.bc.cost', { amount: rupee(x.cost.total) })
                      : t('ai.bc.noCost')}
                  </Text>
                </View>
              ))}
              <Text style={k.sub}>{d.note ?? t('ai.bc.note')}</Text>
            </>
          ) : null}
        </Gate>
      ) : null}
    </ScrollView>
  );
}
