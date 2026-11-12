import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  SP,
  createBranch,
  deactivateBranch,
  fetchBranchList,
  patchBranch,
  reactivateBranch,
  skey,
  type Branch,
} from './api';
import { branchBody, branchErrors, validReason, type BranchForm } from './logic';

const empty = (): BranchForm => ({
  code: '',
  name: '',
  address: '',
  stateCode: '',
  gstin: '',
  phone: '',
  openingDate: '',
});
const toForm = (b: Branch): BranchForm => ({
  code: b.code,
  name: b.name,
  address: b.address ?? '',
  stateCode: b.stateCode ?? '',
  gstin: b.gstin ?? '',
  phone: b.phone ?? '',
  openingDate: b.openingDate ?? '',
});

export default function BranchesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [form, setForm] = useState<BranchForm | null>(null);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [off, setOff] = useState<Branch | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(SP.view);
  const list = useQuery({
    queryKey: skey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchList(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(SP.view)) return <StateView state="denied" message={t('setup.denied')} />;
  const manage = s.can(SP.branch);

  function close() {
    setForm(null);
    setEditing(null);
    setOff(null);
    setReason('');
    setTried(false);
    key.reset();
  }
  const errs = form ? branchErrors(form, editing === null) : [];
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`setup.branch.v.${e}`) : null);
  function save() {
    if (!form) return;
    setTried(true);
    if (branchErrors(form, editing === null).length > 0) return;
    const body = branchBody(form, editing ? toForm(editing) : null);
    if (editing && Object.keys(body).length === 0) return close();
    const fp = `${editing?.id ?? 'new'}|${editing?.version ?? 0}|${JSON.stringify(body)}`;
    void s.act(
      t(editing ? 'setup.branch.updated' : 'setup.branch.created'),
      () =>
        editing
          ? patchBranch(s.client!, editing, body, key.keyFor(fp))
          : createBranch(s.client!, body, key.keyFor(fp)),
      close,
    );
  }
  function deactivate() {
    if (!off) return;
    setTried(true);
    if (!validReason(reason)) return;
    const r = reason.trim();
    void s.act(
      t('setup.branch.deactivated'),
      () => deactivateBranch(s.client!, off.id, r, key.keyFor(`d|${off.id}|${r}`)),
      close,
    );
  }
  const set = (f: keyof BranchForm, v: string) => setForm((p) => (p ? { ...p, [f]: v } : p));

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.setupBranches') }} />
      <Text style={k.title}>{t('setup.branch.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {manage && !form ? (
        <Button label={t('setup.branch.add')} onPress={() => (close(), setForm(empty()))} />
      ) : null}
      {form ? (
        <View style={k.card}>
          {editing === null ? (
            <Field
              label={t('setup.branch.code')}
              value={form.code}
              onChange={(v) => set('code', v.toUpperCase())}
              autoCapitalize="characters"
              error={bad('code')}
            />
          ) : null}
          <Field
            label={t('setup.branch.name')}
            value={form.name}
            onChange={(v) => set('name', v)}
            error={bad('name')}
          />
          <Field
            label={t('setup.branch.address')}
            value={form.address}
            onChange={(v) => set('address', v)}
            multiline
            error={bad('address')}
          />
          <Field
            label={t('setup.branch.state')}
            value={form.stateCode}
            onChange={(v) => set('stateCode', v)}
            keyboard="numeric"
            error={bad('state')}
          />
          <Field
            label={t('setup.branch.gstin')}
            value={form.gstin}
            onChange={(v) => set('gstin', v.toUpperCase())}
            autoCapitalize="characters"
            error={bad('gstin') ?? bad('gstinState')}
          />
          <Field
            label={t('setup.branch.phone')}
            value={form.phone}
            onChange={(v) => set('phone', v)}
            keyboard="phone-pad"
            error={bad('phone')}
          />
          <Field
            label={t('setup.branch.opening')}
            value={form.openingDate}
            onChange={(v) => set('openingDate', v)}
            placeholder="YYYY-MM-DD"
            error={bad('date')}
          />
          <View style={k.row}>
            <Button label={t('setup.save')} disabled={s.busy} onPress={save} />
            <Button kind="ghost" label={t('setup.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Gate q={list} ns="setup" emptyKey="setup.branch.empty" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((b) => (
          <View key={b.id} style={k.card}>
            <Text style={k.name}>
              {b.name} · {b.code}
              {b.isHeadOffice ? ` · ${t('setup.branch.head')}` : ''}
            </Text>
            <Text style={k.sub}>
              {b.stateCode ?? '-'} / {b.gstin ?? '-'} · {b.phone ?? '-'} · {t(`setup.status.${b.status}`)}
            </Text>
            {manage && !form && off?.id !== b.id ? (
              <View style={k.row}>
                {b.status === 'ACTIVE' ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.edit')} ${b.name}`}
                    onPress={() => (close(), setEditing(b), setForm(toForm(b)))}
                  />
                ) : null}
                {b.status === 'ACTIVE' && !b.isHeadOffice ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.deactivate')} ${b.name}`}
                    onPress={() => (close(), setOff(b))}
                  />
                ) : null}
                {b.status === 'INACTIVE' ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.reactivate')} ${b.name}`}
                    disabled={s.busy}
                    onPress={() =>
                      void s.act(
                        t('setup.branch.reactivated'),
                        () => reactivateBranch(s.client!, b.id, key.keyFor(`r|${b.id}`)),
                        () => key.reset(),
                      )
                    }
                  />
                ) : null}
              </View>
            ) : null}
            {off?.id === b.id ? (
              <>
                <Text style={k.sub}>{t('setup.branch.deactivateIntro')}</Text>
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
