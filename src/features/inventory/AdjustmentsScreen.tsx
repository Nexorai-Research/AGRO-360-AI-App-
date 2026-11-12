import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import {
  ADJUST_REASONS,
  PERM,
  adjustAction,
  createAdjustment,
  fetchAdjustments,
  fetchBatches,
  fetchBranchList,
  fetchWarehouseList,
  ikey,
  rejectAdjustment,
  type Adjustment,
} from './api';
import { checkDelta, costAllowed, validCost } from './logic';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

export default function AdjustmentsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);
  const ak = useActionKey();

  const [form, setForm] = useState(false);
  const [branch, setBranch] = useState('');
  const [wh, setWh] = useState('');
  const [reason, setReason] = useState('');
  const [batchId, setBatchId] = useState('');
  const [delta, setDelta] = useState('');
  const [cost, setCost] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ikey(userId, 'adjustments'),
    queryFn: ({ signal }) => fetchAdjustments(client!, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const branches = useQuery({
    queryKey: ikey(userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchList(client!, signal),
    enabled: ready && form,
    staleTime: 5 * 60_000,
  });
  const whs = useQuery({
    queryKey: ikey(userId, 'whs'),
    queryFn: ({ signal }) => fetchWarehouseList(client!, signal),
    enabled: ready && form,
    staleTime: 5 * 60_000,
  });
  const batches = useQuery({
    queryKey: ikey(userId, 'batches'),
    queryFn: ({ signal }) => fetchBatches(client!, signal),
    enabled: ready && form,
  });

  const branchId = branch || branches.data?.[0]?.id || '';
  const whList = (whs.data ?? []).filter((w) => w.branchId === branchId);
  const picked = (batches.data ?? []).find((b) => b.id === batchId);
  const check = picked ? checkDelta(delta, picked.onHand) : 'format';
  const formOk = !!branchId && !!wh && !!reason && !!picked && check === 'ok' && validCost(cost);

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      ak.reset();
      setMsg(done);
      setForm(false);
      setRejecting(null);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const act = (a: Adjustment, action: 'submit' | 'cancel' | 'approve', done: string) =>
    run(() => adjustAction(client!, a.id, action, ak.keyFor(`${a.id}|${action}`)), done);

  if (!can(PERM.view)) return <StateView state="denied" message={t('adjust.denied')} />;
  if (list.isPending && list.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (list.error) {
    const m = errorMessage(list.error);
    return (
      <StateView
        state={isNetwork(list.error) ? 'offline' : 'error'}
        message={
          isNetwork(list.error)
            ? t('adjust.offline')
            : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })
        }
        onRetry={() => void list.refetch()}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t('adjust.title')}</Text>
      <Text style={kit.sub}>{t('adjust.hint')}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {failure ? (
        <Notice
          tone="error"
          text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
        />
      ) : null}
      {can(PERM.adjust) ? (
        <Button
          label={t('adjust.new')}
          onPress={() => {
            ak.reset();
            setForm(true);
          }}
        />
      ) : null}

      {form ? (
        <Card>
          {(branches.data?.length ?? 0) > 1 ? (
            <Chips
              label={t('adjust.branch')}
              options={branches.data!.map((b) => ({ id: b.id, label: b.name }))}
              value={branchId}
              onChange={(v) => {
                setBranch(v);
                setWh('');
              }}
            />
          ) : null}
          <Chips
            label={t('adjust.warehouse')}
            options={whList.map((w) => ({ id: w.id, label: w.name }))}
            value={wh}
            onChange={setWh}
          />
          <Chips
            label={t('adjust.reason')}
            options={ADJUST_REASONS.map((r) => ({ id: r, label: r }))}
            value={reason}
            onChange={setReason}
          />
          <Chips
            label={t('adjust.batch')}
            options={(batches.data ?? []).map((b) => ({
              id: b.id,
              label: `${b.skuCode} / ${b.batchNo} (${b.onHand})`,
            }))}
            value={batchId}
            onChange={setBatchId}
          />
          <Field
            label={t('adjust.qty')}
            value={delta}
            onChange={setDelta}
            keyboard="numbers-and-punctuation"
            error={delta !== '' && check !== 'ok' ? t(`adjust.v.${check}`) : null}
          />
          {costAllowed(delta) ? (
            <Field
              label={t('adjust.unitCost')}
              value={cost}
              onChange={setCost}
              keyboard="decimal-pad"
              error={validCost(cost) ? null : t('adjust.v.format')}
            />
          ) : null}
          <Field label={t('adjust.remarks')} value={remarks} onChange={setRemarks} />
          <Button
            label={t('adjust.save')}
            disabled={busy || !formOk}
            onPress={() => {
              const line = {
                warehouseId: wh,
                skuId: picked!.skuId,
                batchId,
                qtyDelta: delta.trim(),
                ...(costAllowed(delta) && cost.trim() ? { unitCost: cost.trim() } : {}),
              };
              const body = {
                branchId,
                reasonCode: reason,
                ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
                lines: [line],
              };
              void run(
                () => createAdjustment(client!, body, ak.keyFor(JSON.stringify(body))),
                t('adjust.saved'),
              );
            }}
          />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setForm(false)} />
        </Card>
      ) : null}

      {(list.data ?? []).length === 0 ? <Text style={kit.sub}>{t('adjust.empty')}</Text> : null}
      {(list.data ?? []).map((a) => (
        <Card key={a.id}>
          <Text style={kit.name}>
            {a.number} · {a.status}
          </Text>
          <Text style={kit.sub}>
            {[a.adjustmentDate, a.reasonCode, a.totalValue === null ? null : formatINR(a.totalValue)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {a.decisionNote ? <Text style={kit.sub}>{a.decisionNote}</Text> : null}
          <View style={kit.row}>
            {a.status === 'DRAFT' && can(PERM.adjust) ? (
              <Button
                label={t('adjust.submit')}
                disabled={busy}
                onPress={() => void act(a, 'submit', t('adjust.submitted', { number: a.number }))}
              />
            ) : null}
            {a.status === 'DRAFT' && can(PERM.adjust) ? (
              <Button
                kind="ghost"
                label={t('adjust.cancel')}
                disabled={busy}
                onPress={() => void act(a, 'cancel', t('adjust.cancelled', { number: a.number }))}
              />
            ) : null}
            {a.status === 'SUBMITTED' && can(PERM.approve) ? (
              <Button
                label={t('adjust.approve')}
                disabled={busy}
                onPress={() => void act(a, 'approve', t('adjust.approved', { number: a.number }))}
              />
            ) : null}
            {a.status === 'SUBMITTED' && can(PERM.approve) ? (
              <Button
                kind="ghost"
                label={t('adjust.reject')}
                onPress={() => {
                  ak.reset();
                  setNote('');
                  setRejecting(a.id);
                }}
              />
            ) : null}
            {a.status === 'SUBMITTED' && can(PERM.adjust) ? (
              <Button
                kind="ghost"
                label={t('adjust.withdraw')}
                disabled={busy}
                onPress={() => void act(a, 'cancel', t('adjust.cancelled', { number: a.number }))}
              />
            ) : null}
          </View>
          {rejecting === a.id ? (
            <View style={{ gap: 8 }}>
              <Field label={t('adjust.rejectReason')} value={note} onChange={setNote} />
              <Button
                label={t('adjust.rejectNow')}
                disabled={busy || !note.trim()}
                onPress={() =>
                  void run(
                    () =>
                      rejectAdjustment(client!, a.id, note.trim(), ak.keyFor(`${a.id}|rej|${note.trim()}`)),
                    t('adjust.rejected', { number: a.number }),
                  )
                }
              />
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}
