import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Notice, kit } from '@/ui/kit';
import { ActionForm, Denied, Loaded, Row, itemsOf, s, useBranchWarehouse, useCan, useGet, useRefresh, type FieldDef } from './kit';

export const TR_PERM = { view: 'inventory.view', transfer: 'inventory.transfer', damage: 'inventory.damage' } as const;
const DAMAGE_REASONS = ['DAMAGED', 'LEAKAGE', 'PEST', 'MOISTURE', 'EXPIRED', 'OTHER'];

interface Tr {
  id: string;
  number: string;
  transferDate: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  purpose: string;
  status: string;
}
type Mode = null | 'transfer' | 'damage' | 'writeoff';

export default function TransfersScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const [mode, setMode] = useState<Mode>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = can(TR_PERM.view);
  const list = useGet<{ items: Tr[] }>('/inventory/transfers', { limit: 100 }, ok);
  const { warehouses } = useBranchWarehouse(ok);
  if (!ok) return <Denied text={t('transfers.denied')} />;
  const wname = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  const wopts = (f: (w: (typeof warehouses)[number]) => boolean) => warehouses.filter(f).map((w) => ({ id: w.id, label: w.name }));
  const reasons = DAMAGE_REASONS.map((r) => ({ id: r, label: t(`transfers.reasons.${r}`) }));

  const fields: Record<Exclude<Mode, null>, FieldDef[]> = {
    transfer: [
      { name: 'from', label: t('transfers.from'), kind: 'choice', required: true, options: wopts(() => true) },
      { name: 'to', label: t('transfers.to'), kind: 'choice', required: true, options: wopts(() => true) },
      { name: 'sku', label: t('transfers.product'), kind: 'product', required: true },
      { name: 'qty', label: t('transfers.qty'), kind: 'qty', required: true, positive: true },
      { name: 'remarks', label: t('transfers.remarks'), kind: 'text' },
    ],
    damage: [
      { name: 'from', label: t('transfers.from'), kind: 'choice', required: true, options: wopts((w) => w.sellable !== false) },
      { name: 'sku', label: t('transfers.product'), kind: 'product', required: true },
      { name: 'qty', label: t('transfers.qty'), kind: 'qty', required: true, positive: true },
      { name: 'reason', label: t('transfers.reason'), kind: 'choice', required: true, options: reasons },
    ],
    writeoff: [
      { name: 'from', label: t('transfers.damagedWarehouse'), kind: 'choice', required: true, options: wopts((w) => w.sellable === false) },
      { name: 'sku', label: t('transfers.product'), kind: 'product', required: true },
      { name: 'qty', label: t('transfers.qty'), kind: 'qty', required: true, positive: true },
      { name: 'reason', label: t('transfers.reason'), kind: 'choice', required: true, options: reasons },
    ],
  };

  function send(m: Exclude<Mode, null>, v: Record<string, string | boolean>, key: string) {
    const line = { skuId: String(v.sku), qty: String(v.qty).trim() };
    if (m === 'transfer') {
      const body: Record<string, unknown> = { fromWarehouseId: v.from, toWarehouseId: v.to, lines: [line] };
      if (String(v.remarks).trim()) body.remarks = String(v.remarks).trim();
      return client!.post('/inventory/transfers/internal', { body, idempotencyKey: key });
    }
    if (m === 'damage') return client!.post('/inventory/damage', { body: { fromWarehouseId: v.from, reasonCode: v.reason, lines: [line] }, idempotencyKey: key });
    return client!.post('/inventory/damage/write-off', { body: { warehouseId: v.from, reasonCode: v.reason, lines: [line] }, idempotencyKey: key });
  }

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('transfers.title')}
      </Text>
      <Text style={kit.sub}>{t('transfers.intro')}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {mode === null ? (
        <>
          {can(TR_PERM.transfer) ? <Button label={t('transfers.new')} onPress={() => setMode('transfer')} /> : null}
          {can(TR_PERM.damage) ? <Button kind="ghost" label={t('transfers.toDamaged')} onPress={() => setMode('damage')} /> : null}
          {can(TR_PERM.damage) ? <Button kind="ghost" label={t('transfers.writeOff')} onPress={() => setMode('writeoff')} /> : null}
        </>
      ) : (
        <ActionForm
          key={mode}
          title={t(`transfers.mode.${mode}`)}
          fields={fields[mode]}
          submitLabel={t(`transfers.submit.${mode}`)}
          hint={mode === 'writeoff' ? t('transfers.writeOffHint') : undefined}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMsg(t(`transfers.done.${mode}`));
            setMode(null);
            refresh();
          }}
          send={(v, key) => send(mode, v, key)}
        />
      )}
      <Loaded q={list} empty={t('transfers.empty')} isEmpty={itemsOf(list.data).length === 0} offlineKey="transfers.offline">
        {itemsOf(list.data).map((x) => (
          <Row
            key={x.id}
            title={`${x.number} · ${t(`transfers.status.${x.status}`, { defaultValue: x.status })}`}
            lines={[`${x.transferDate} · ${wname(x.fromWarehouseId)} → ${wname(x.toWarehouseId)}`, x.purpose]}
          />
        ))}
      </Loaded>
    </ScrollView>
  );
}
