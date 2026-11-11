import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Chips, kit } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { PERM, fetchProducts, pkey, type ProductStatusFilter } from './api';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('ACTIVE');
  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  const list = useQuery({
    queryKey: pkey(userId, 'list', `${q}|${status}`),
    queryFn: ({ signal }) => fetchProducts(client!, q, status, signal),
    enabled: client !== null && me !== null && can(PERM.view),
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  if (!can(PERM.view)) return <StateView state="denied" message={t('products.denied')} />;
  const err = list.error ? errorMessage(list.error) : null;

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t('products.title')}</Text>
      {can(PERM.create) ? <Button label={t('products.new')} onPress={() => router.push('/products/form' as never)} /> : null}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('products.search')}
        accessibilityLabel={t('products.search')}
        autoCorrect={false}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff', color: colors.ink }}
      />
      <Chips
        label={t('products.status')}
        options={(['ACTIVE', 'INACTIVE', 'ARCHIVED', ''] as const).map((s) => ({ id: s, label: t(`products.st.${s || 'ALL'}`) }))}
        value={status}
        onChange={setStatus}
      />
      {list.isPending && list.fetchStatus !== 'idle' ? <StateView state="loading" /> : null}
      {err ? (
        <StateView
          state={isNetwork(list.error) ? 'offline' : err.key === 'errors.FORBIDDEN' ? 'denied' : 'error'}
          message={isNetwork(list.error) ? t('products.offline') : t(err.key, { ...err.params, correlationId: err.params.correlationId ?? '-' })}
          onRetry={() => void list.refetch()}
        />
      ) : null}
      {list.data ? <Text style={kit.sub}>{t('products.count', { count: list.data.total })}</Text> : null}
      {list.data && list.data.items.length === 0 ? <Text style={kit.sub}>{t('products.empty')}</Text> : null}
      {(list.data?.items ?? []).map((p) => (
        <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(`/products/${p.id}` as never)}>
          <Card>
            <Text style={kit.name}>{p.name}</Text>
            <Text style={kit.sub}>
              {[p.code, p.categoryName, p.sellingPrice ? formatINR(p.sellingPrice) : null, p.status !== 'ACTIVE' ? p.status : null].filter(Boolean).join(' · ')}
            </Text>
          </Card>
        </Pressable>
      ))}
      <View />
    </ScrollView>
  );
}
