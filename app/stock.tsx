import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage } from '../src/api/errors';
import { useAuth } from '../src/auth/AuthProvider';
import { fetchProductByBarcode } from '../src/features/stock/api';
import { BarcodeScanner } from '../src/features/stock/BarcodeScanner';
import { useBatches, useBranches, useDebounced, useStock, useWarehouses } from '../src/features/stock/hooks';
import { Banner, StateView } from '../src/features/stock/StateView';
import { BatchItem, StockItem } from '../src/features/stock/StockRows';
import type { BatchRow, BatchView, StockRow } from '../src/features/stock/types';
import { Button } from '../src/ui/Button';
import { colors, radius } from '../src/ui/theme';

type Tab = 'stock' | 'batches';

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function StockScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [tab, setTab] = useState<Tab>('stock');
  const [view, setView] = useState<BatchView>('withStock');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const [branch, setBranch] = useState<string | undefined>();
  const [warehouse, setWarehouse] = useState<string | undefined>();
  const [product, setProduct] = useState<{ id: string; name: string } | undefined>();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const branches = useBranches(client);
  const warehouses = useWarehouses(client, branch);

  const stock = useStock(client, { q: q || undefined, branch, warehouse, product: product?.id }, tab === 'stock');
  const batches = useBatches(client, view, { warehouse, product: product?.id }, tab === 'batches');
  const active = tab === 'stock' ? stock : batches;

  const rows = useMemo<(StockRow | BatchRow)[]>(
    () => (active.data?.pages ?? []).flatMap((p) => p.items as (StockRow | BatchRow)[]),
    [active.data],
  );
  const total = active.data?.pages[0]?.total ?? 0;

  const onScanned = useCallback(
    async (code: string) => {
      setScanning(false);
      if (!client) return;
      try {
        const hit = await fetchProductByBarcode(client, code);
        setScanError(null);
        setProduct({ id: hit.id, name: `${hit.name} (${hit.code})` });
      } catch (e) {
        const m = errorMessage(e);
        setScanError(e instanceof ApiError && e.status === 404 ? t('stock.barcodeNotFound', { code }) : t(m.key, m.params));
      }
    },
    [client, t],
  );

  const err = active.error;
  const denied = err instanceof ApiError && err.status === 403;
  const offline = err instanceof ApiError && err.code === 'NETWORK';
  const m = err ? errorMessage(err) : null;
  const hasData = rows.length > 0 || (active.data !== undefined && !active.isError);
  const asOf = active.dataUpdatedAt ? timeOf(active.dataUpdatedAt) : null;

  let body;
  if (!client || active.isPending) {
    body = <StateView state="loading" />;
  } else if (active.isError && !active.data) {
    body = denied ? (
      <StateView state="denied" />
    ) : offline ? (
      <StateView state="offline" onRetry={() => void active.refetch()} />
    ) : (
      <StateView state="error" message={m ? t(m.key, m.params) : undefined} onRetry={() => void active.refetch()} />
    );
  } else {
    body = (
      <FlatList<StockRow | BatchRow>
        data={rows}
        keyExtractor={(r) => ('id' in r ? r.id : `${r.skuId}:${r.warehouseId}:${r.batchId ?? '-'}`)}
        renderItem={({ item }) => ('id' in item ? <BatchItem row={item} /> : <StockItem row={item} />)}
        refreshing={active.isRefetching && !active.isFetchingNextPage}
        onRefresh={() => void active.refetch()}
        onEndReached={() => {
          if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            {active.isError && active.data ? (
              offline ? (
                <Banner tone="warn" text={t('stock.staleBanner', { time: asOf ?? '-' })} />
              ) : (
                <Banner tone="danger" text={m ? t(m.key, m.params) : ''} />
              )
            ) : null}
          </View>
        }
        ListEmptyComponent={hasData ? <StateView state="empty" message={tab === 'batches' ? t('stock.emptyBatches') : undefined} /> : undefined}
        ListFooterComponent={
          <View>
            {active.isFetchingNextPage ? <Text style={s.foot}>{t('common.loading')}</Text> : null}
            {rows.length > 0 ? (
              <Text style={s.foot}>
                {t('stock.total', { count: total })}
                {asOf ? ` · ${t('stock.asOf', { time: asOf })}` : ''}
              </Text>
            ) : null}
          </View>
        }
      />
    );
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title} accessibilityRole="header">
        {t('stock.title')}
      </Text>

      <View style={s.row}>
        <Chip label={t('stock.tabStock')} on={tab === 'stock'} onPress={() => setTab('stock')} />
        <Chip label={t('stock.tabBatches')} on={tab === 'batches'} onPress={() => setTab('batches')} />
      </View>

      <View style={s.searchRow}>
        {tab === 'stock' ? (
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('stock.search')}
            accessibilityLabel={t('stock.search')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={s.input}
          />
        ) : (
          <View style={s.input} />
        )}
        <Button label={t('stock.scan')} onPress={() => setScanning(true)} />
      </View>

      {product ? (
        <View style={s.row}>
          <Chip label={`${product.name}  ✕`} on onPress={() => setProduct(undefined)} />
        </View>
      ) : null}
      {scanError ? <Banner tone="danger" text={scanError} /> : null}

      {tab === 'batches' ? (
        <View style={s.row}>
          <Chip label={t('stock.viewWithStock')} on={view === 'withStock'} onPress={() => setView('withStock')} />
          <Chip label={t('stock.viewExpiring')} on={view === 'expiring'} onPress={() => setView('expiring')} />
          <Chip label={t('stock.viewExpired')} on={view === 'expired'} onPress={() => setView('expired')} />
        </View>
      ) : null}

      {tab === 'stock' && branches.data && branches.data.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          <Chip label={t('stock.allBranches')} on={!branch} onPress={() => (setBranch(undefined), setWarehouse(undefined))} />
          {branches.data.map((b) => (
            <Chip key={b.id} label={b.name} on={branch === b.id} onPress={() => (setBranch(b.id), setWarehouse(undefined))} />
          ))}
        </ScrollView>
      ) : null}
      {branch && warehouses.data && warehouses.data.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          <Chip label={t('stock.allWarehouses')} on={!warehouse} onPress={() => setWarehouse(undefined)} />
          {warehouses.data.map((w) => (
            <Chip key={w.id} label={w.name} on={warehouse === w.id} onPress={() => setWarehouse(w.id)} />
          ))}
        </ScrollView>
      ) : null}

      <View style={s.body}>{body}</View>

      <BarcodeScanner visible={scanning} onScanned={(c) => void onScanned(c)} onClose={() => setScanning(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingTop: 16, paddingHorizontal: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: 48, borderRadius: radius, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.ink, fontSize: 15 },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
  body: { flex: 1 },
  list: { paddingBottom: 24 },
  foot: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingVertical: 8 },
});
