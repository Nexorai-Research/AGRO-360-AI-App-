import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  SP,
  WAREHOUSE_KINDS,
  createBin,
  createWarehouse,
  deactivateWarehouse,
  fetchBins,
  fetchBranchList,
  fetchWarehouseList,
  patchWarehouse,
  reactivateWarehouse,
  setBinActive,
  skey,
  type Warehouse,
} from './api';
import { binErrors, validReason, warehouseErrors, type WarehouseForm } from './logic';

const nice = (d: string) => d.replace(/_/g, ' ').toLowerCase();

export default function WarehousesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [form, setForm] = useState<WarehouseForm | null>(null);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [off, setOff] = useState<Warehouse | null>(null);
  const [reason, setReason] = useState('');
  const [binsOf, setBinsOf] = useState<Warehouse | null>(null);
  const [bin, setBin] = useState<{ label: string; rack: string; shelf: string } | null>(null);
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(SP.view);

  const whs = useQuery({
    queryKey: skey(s.userId, 'warehouses'),
    queryFn: ({ signal }) => fetchWarehouseList(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const branches = useQuery({
    queryKey: skey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchList(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const bins = useQuery({
    queryKey: skey(s.userId, 'bins', binsOf?.id ?? ''),
    queryFn: ({ signal }) => fetchBins(s.client!, binsOf!.id, signal),
    enabled: ok && binsOf !== null,
    retry: retryNetworkOnce,
  });
  if (!s.can(SP.view)) return <StateView state="denied" message={t('setup.denied')} />;
  const manage = s.can(SP.warehouse);
  const bname = new Map((branches.data ?? []).map((b) => [b.id, b.name]));

  function close() {
    setForm(null);
    setEditing(null);
    setOff(null);
    setReason('');
    setBin(null);
    setTried(false);
    key.reset();
  }
  const errs = form ? warehouseErrors(form, editing === null) : [];
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`setup.wh.v.${e}`) : null);
  function save() {
    if (!form) return;
    setTried(true);
    if (warehouseErrors(form, editing === null).length > 0) return;
    if (editing) {
      const body: Record<string, string> = {};
      if (form.name.trim() !== editing.name) body.name = form.name.trim();
      if (form.kind !== editing.kind) body.kind = form.kind;
      if (Object.keys(body).length === 0) return close();
      void s.act(
        t('setup.wh.updated'),
        () =>
          patchWarehouse(
            s.client!,
            editing,
            body,
            key.keyFor(`p|${editing.id}|${editing.version}|${JSON.stringify(body)}`),
          ),
        close,
      );
    } else {
      const body = {
        branchId: form.branchId,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        kind: form.kind,
      };
      void s.act(
        t('setup.wh.created'),
        () => createWarehouse(s.client!, body, key.keyFor(`n|${JSON.stringify(body)}`)),
        close,
      );
    }
  }
  function deactivate() {
    if (!off) return;
    setTried(true);
    if (!validReason(reason)) return;
    const r = reason.trim();
    void s.act(
      t('setup.wh.deactivated'),
      () => deactivateWarehouse(s.client!, off.id, r, key.keyFor(`d|${off.id}|${r}`)),
      close,
    );
  }
  function addBin() {
    if (!bin || !binsOf) return;
    setTried(true);
    if (binErrors(bin).length > 0) return;
    const body = {
      label: bin.label.trim(),
      ...(bin.rack.trim() ? { rack: bin.rack.trim() } : {}),
      ...(bin.shelf.trim() ? { shelf: bin.shelf.trim() } : {}),
    };
    void s.act(
      t('setup.wh.binAdded'),
      () => createBin(s.client!, binsOf.id, body, key.keyFor(`b|${binsOf.id}|${JSON.stringify(body)}`)),
      () => (setBin(null), setTried(false), key.reset()),
    );
  }
  const set = (f: keyof WarehouseForm, v: string) => setForm((p) => (p ? { ...p, [f]: v } : p));

  if (binsOf) {
    const bErr = bin ? binErrors(bin) : [];
    return (
      <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ headerShown: true, title: t('nav.setupWarehouses') }} />
        <Button kind="ghost" label={t('setup.back')} onPress={() => (close(), setBinsOf(null))} />
        <Text style={k.title}>{t('setup.wh.binsOf', { name: binsOf.name })}</Text>
        {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
        {s.failure ? <Notice tone="error" text={s.failure} /> : null}
        {manage && !bin ? (
          <Button
            label={t('setup.wh.addBin')}
            onPress={() => (key.reset(), setBin({ label: '', rack: '', shelf: '' }))}
          />
        ) : null}
        {bin ? (
          <View style={k.card}>
            <Field
              label={t('setup.wh.binLabel')}
              value={bin.label}
              onChange={(v) => setBin({ ...bin, label: v })}
              error={tried && bErr.includes('label') ? t('setup.wh.v.binLabel') : null}
            />
            <Field
              label={t('setup.wh.rack')}
              value={bin.rack}
              onChange={(v) => setBin({ ...bin, rack: v })}
              error={tried && bErr.includes('rack') ? t('setup.wh.v.binText') : null}
            />
            <Field
              label={t('setup.wh.shelf')}
              value={bin.shelf}
              onChange={(v) => setBin({ ...bin, shelf: v })}
              error={tried && bErr.includes('shelf') ? t('setup.wh.v.binText') : null}
            />
            <View style={k.row}>
              <Button label={t('setup.save')} disabled={s.busy} onPress={addBin} />
              <Button
                kind="ghost"
                label={t('setup.cancel')}
                onPress={() => (setBin(null), setTried(false))}
              />
            </View>
          </View>
        ) : null}
        <Gate q={bins} ns="setup" emptyKey="setup.wh.noBins" isEmpty={(bins.data ?? []).length === 0}>
          {(bins.data ?? []).map((b) => (
            <View key={b.id} style={k.card}>
              <Text style={k.name}>{b.label}</Text>
              <Text style={k.sub}>
                {t('setup.wh.rack')}: {b.rack ?? '-'} · {t('setup.wh.shelf')}: {b.shelf ?? '-'} ·{' '}
                {t(b.active ? 'setup.status.ACTIVE' : 'setup.status.INACTIVE')}
              </Text>
              {manage ? (
                <Button
                  kind="ghost"
                  label={`${t(b.active ? 'setup.deactivate' : 'setup.activate')} ${b.label}`}
                  disabled={s.busy}
                  onPress={() =>
                    void s.act(
                      t('setup.wh.binChanged'),
                      () => setBinActive(s.client!, b.id, !b.active, key.keyFor(`ba|${b.id}|${!b.active}`)),
                      () => key.reset(),
                    )
                  }
                />
              ) : null}
            </View>
          ))}
        </Gate>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={whs.isRefetching} onRefresh={() => void whs.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.setupWarehouses') }} />
      <Text style={k.title}>{t('setup.wh.title')}</Text>
      <Text style={k.sub}>{t('setup.wh.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {manage && !form ? (
        <Button
          label={t('setup.wh.add')}
          onPress={() => (close(), setForm({ branchId: '', code: '', name: '', kind: 'SELLABLE' }))}
        />
      ) : null}
      {form ? (
        <View style={k.card}>
          {editing === null ? (
            <>
              <Text style={k.label}>{t('setup.wh.branch')}</Text>
              <Chips
                options={(branches.data ?? [])
                  .filter((b) => b.status === 'ACTIVE')
                  .map((b) => ({ value: b.id, label: b.name }))}
                value={form.branchId}
                onChange={(v) => set('branchId', v)}
              />
              {bad('branch') ? <Text style={k.error}>{bad('branch')}</Text> : null}
              <Field
                label={t('setup.wh.code')}
                value={form.code}
                onChange={(v) => set('code', v.toUpperCase())}
                autoCapitalize="characters"
                error={bad('code')}
              />
            </>
          ) : null}
          <Field
            label={t('setup.wh.name')}
            value={form.name}
            onChange={(v) => set('name', v)}
            error={bad('name')}
          />
          <Chips
            options={WAREHOUSE_KINDS.map((x) => ({ value: x, label: nice(x) }))}
            value={form.kind}
            onChange={(v) => set('kind', v)}
          />
          <View style={k.row}>
            <Button label={t('setup.save')} disabled={s.busy} onPress={save} />
            <Button kind="ghost" label={t('setup.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Gate q={whs} ns="setup" emptyKey="setup.wh.empty" isEmpty={(whs.data ?? []).length === 0}>
        {(whs.data ?? []).map((w) => (
          <View key={w.id} style={k.card}>
            <Text style={k.name}>
              {w.name} · {w.code}
            </Text>
            <Text style={k.sub}>
              {bname.get(w.branchId) ?? '-'} · {nice(w.kind)} ·{' '}
              {t(w.sellable ? 'setup.wh.sellable' : 'setup.wh.notSellable')} · {t(`setup.status.${w.status}`)}
            </Text>
            {!form && off?.id !== w.id ? (
              <View style={k.row}>
                <Button
                  kind="ghost"
                  label={`${t('setup.wh.bins')} ${w.name}`}
                  onPress={() => (close(), setBinsOf(w))}
                />
                {manage && w.status === 'ACTIVE' ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.edit')} ${w.name}`}
                    onPress={() => (
                      close(),
                      setEditing(w),
                      setForm({ branchId: w.branchId, code: w.code, name: w.name, kind: w.kind })
                    )}
                  />
                ) : null}
                {manage && w.status === 'ACTIVE' ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.deactivate')} ${w.name}`}
                    onPress={() => (close(), setOff(w))}
                  />
                ) : null}
                {manage && w.status === 'INACTIVE' ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.reactivate')} ${w.name}`}
                    disabled={s.busy}
                    onPress={() =>
                      void s.act(
                        t('setup.wh.reactivated'),
                        () => reactivateWarehouse(s.client!, w.id, key.keyFor(`r|${w.id}`)),
                        () => key.reset(),
                      )
                    }
                  />
                ) : null}
              </View>
            ) : null}
            {off?.id === w.id ? (
              <>
                <Text style={k.sub}>{t('setup.wh.deactivateIntro')}</Text>
                <Field
                  label={t('setup.reason')}
                  value={reason}
                  onChange={setReason}
                  multiline
                  error={tried && !validReason(reason) ? t('setup.v.reason') : null}
                />
                <View style={k.row}>
                  <Button label={t('setup.confirmDeactivate')} disabled={s.busy} onPress={deactivate} />
                  <Button kind="ghost" label={t('setup.cancel')} onPress={close} />
                </View>
              </>
            ) : null}
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}
