import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, kit } from '@/ui/kit';
import { useDebounced } from '../stock/hooks';
import { Denied, Loaded, itemsOf, s, useCan, useGet } from '../inventory/kit';
import { PERM, type Product, type ProductStatusFilter } from './api';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const can = useCan();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('ACTIVE');
  const q = useDebounced(text.trim());
  const ok = can(PERM.view);
  const r = useGet<{ items: Product[]; total: number }>('/products', { q: q || undefined, status: status || undefined, limit: 100 }, ok);
  if (!ok) return <Denied text={t('products.denied')} />;
  const rows = itemsOf(r.data);
  const go = (path: string) => router.push(path as never);
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('products.title')}
      </Text>
      <Field label={t('products.search')} value={text} onChange={setText} />
      <Chips
        label={t('products.statusFilter')}
        value={status}
        onChange={(x) => setStatus(x === status ? '' : x)}
        options={(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const).map((x) => ({ id: x, label: t(`products.status.${x}`) }))}
      />
      {can(PERM.create) ? <Button label={t('products.new')} onPress={() => go('/products/new')} /> : null}
      <Button kind="ghost" label={t('products.masters')} onPress={() => go('/product-masters')} />
      <Loaded q={r} empty={t('products.empty')} isEmpty={rows.length === 0} offlineKey="products.offline">
        {rows.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name} ${p.code}`} onPress={() => go(`/products/${p.id}`)}>
            <Card>
              <Text style={kit.name}>{p.name}</Text>
              <Text style={kit.sub}>
                {p.code} · {p.categoryName ?? '-'} · {t(`products.status.${p.status}`)}
              </Text>
              <Text style={kit.sub}>
                {t('products.mrp')} {p.mrp === null ? '-' : formatINR(p.mrp)} · {t('products.sellingPrice')} {p.sellingPrice === null ? '-' : formatINR(p.sellingPrice)}
              </Text>
            </Card>
          </Pressable>
        ))}
      </Loaded>
    </ScrollView>
  );
}
