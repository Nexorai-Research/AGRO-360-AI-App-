import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { searchProducts, type ProductLite } from '../pos/api';
import { DAMAGE_REASONS, PERM, fetchTransfers, fetchWarehouseList, ikey, postDamage, postTransfer } from './api';
import { checkQty } from './logic';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

export default function TransfersScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);
  const ak = useActionKey();

  const [mode, setMode] = useState<null | 'transfer' | 'damage'>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [qty, setQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  const list = useQuery({ queryKey: ikey(userId, 'transfers'), queryFn: ({ signal }) => fetchTransfers(client!, signal), enabled: ready, retry: (n, e) => isNetwork(e) && n < 1 });
  const whs = useQuery({ queryKey: ikey(userId, 'whs'), queryFn: ({ signal }) => fetchWarehouseList(client!, signal), enabled: ready, staleTime: 5 * 60_000 });
  const found = useQuery({ queryKey: ikey(userId, 'prod', q), queryFn: ({ signal }) => searchProducts(client!, q, signal), enabled: ready && mode !== null && q.length >= 2 && product === null });

  const whName = (id: string) => whs.data?.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  const fromBranch = whs.data?.find((w) => w.id === from)?.branchId;
  const toOptions = (whs.data ?? []).filter((w) => w.branchId === fromBranch && w.id !== from);
  const qtyCheck = checkQty(qty);
  const ok = !!product && qtyCheck === 'ok' && !!from && (mode === 'transfer' ? !!to : !!reason);

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      ak.reset();
      setMsg(done);
      setMode(null);
      setProduct(null);
      setQty('');
      setSearch('');
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const open = (m: 'transfer' | 'damage') => { ak.reset(); setFailure(null); setMsg(null); setMode(m); };

  if (!can(PERM.view)) return <StateView state="denied" message={t('transfers.denied')} />;
  if (list.isPending && list.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (list.error) {
    const m = errorMessage(list.error);
    return <StateView state={isNetwork(list.error) ? 'offline' : 'error'} message={isNetwork(list.error) ? t('transfers.offline') : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })} onRetry={() => void list.refetch()} />;
  }

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t('transfers.title')}</Text>
      <Text style={kit.sub}>{t('transfers.hint')}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {failure ? <Notice tone="error" text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })} /> : null}
      {can(PERM.transfer) ? <Button label={t('transfers.new')} onPress={() => open('transfer')} /> : null}
      {can(PERM.damage) ? <Button kind="ghost" label={t('transfers.damage')} onPress={() => open('damage')} /> : null}

      {mode ? (
        <Card>
          <Chips label={t('transfers.from')} options={(whs.data ?? []).filter((w) => mode === 'transfer' || w.sellable).map((w) => ({ id: w.id, label: w.name }))} value={from} onChange={(v) => { setFrom(v); setTo(''); }} />
          {mode === 'transfer' ? <Chips label={t('transfers.to')} options={toOptions.map((w) => ({ id: w.id, label: w.name }))} value={to} onChange={setTo} /> : <Chips label={t('adjust.reason')} options={DAMAGE_REASONS.map((r) => ({ id: r, label: r }))} value={reason} onChange={setReason} />}
          {product ? (
            <Text style={kit.name}>{product.name}</Text>
          ) : (
            <>
              <Field label={t('transfers.product')} value={search} onChange={setSearch} />
              {(found.data ?? []).map((p) => (
                <Button key={p.id} kind="ghost" label={p.name} onPress={() => setProduct(p)} />
              ))}
            </>
          )}
          <Field label={t('transfers.qty')} value={qty} onChange={setQty} keyboard="decimal-pad" error={qty !== '' && qtyCheck !== 'ok' ? t(`adjust.v.${qtyCheck}`) : null} />
          {mode === 'transfer' ? <Field label={t('adjust.remarks')} value={remarks} onChange={setRemarks} /> : null}
          <Button
            label={t(mode === 'transfer' ? 'transfers.post' : 'transfers.moveDamaged')}
            disabled={busy || !ok}
            onPress={() => {
              const lines = [{ skuId: product!.id, qty: qty.trim() }];
              if (mode === 'transfer') {
                const b = { fromWarehouseId: from, toWarehouseId: to, ...(remarks.trim() ? { remarks: remarks.trim() } : {}), lines };
                void run(() => postTransfer(client!, b, ak.keyFor(`t|${JSON.stringify(b)}`)), t('transfers.posted'));
              } else {
                const b = { fromWarehouseId: from, reasonCode: reason, lines };
                void run(() => postDamage(client!, b, ak.keyFor(`d|${JSON.stringify(b)}`)), t('transfers.movedDamaged'));
              }
            }}
          />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setMode(null)} />
        </Card>
      ) : null}

      {(list.data ?? []).length === 0 ? <Text style={kit.sub}>{t('transfers.empty')}</Text> : null}
      {(list.data ?? []).map((x) => (
        <Card key={x.id}>
          <Text style={kit.name}>{x.number} · {x.status}</Text>
          <Text style={kit.sub}>{[x.transferDate, `${whName(x.fromWarehouseId)} → ${whName(x.toWarehouseId)}`, x.purpose].join(' · ')}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
