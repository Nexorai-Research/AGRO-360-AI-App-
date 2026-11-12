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
import { SP, fetchBranchList, fetchSeries, fetchYears, saveSeries, skey, type Series } from './api';
import { seriesErrors } from './logic';

const nice = (d: string) => d.replace(/_/g, ' ').toLowerCase();

export default function NumberingScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [branchId, setBranchId] = useState('');
  const [fyPick, setFyPick] = useState('');
  const [edit, setEdit] = useState<Series | null>(null);
  const [f, setF] = useState({ prefix: '', padding: '', nextNumber: '' });
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(SP.view);

  const branches = useQuery({
    queryKey: skey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchList(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const years = useQuery({
    queryKey: skey(s.userId, 'years'),
    queryFn: ({ signal }) => fetchYears(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const branch = branchId || branches.data?.[0]?.id || '';
  const fy = fyPick || years.data?.[years.data.length - 1]?.label || '';
  const list = useQuery({
    queryKey: skey(s.userId, 'series', `${branch}|${fy}`),
    queryFn: ({ signal }) => fetchSeries(s.client!, branch, fy, signal),
    enabled: ok && branch !== '' && fy !== '',
    retry: retryNetworkOnce,
  });
  if (!s.can(SP.view)) return <StateView state="denied" message={t('setup.denied')} />;
  const manage = s.can(SP.numbering);

  function close() {
    setEdit(null);
    setTried(false);
    key.reset();
  }
  const errs = edit ? seriesErrors(edit.docType, f) : [];
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`setup.num.v.${e}`) : null);
  function save() {
    if (!edit) return;
    setTried(true);
    if (seriesErrors(edit.docType, f).length > 0) return;
    const body = {
      branchId: edit.branchId,
      docType: edit.docType,
      fy: edit.fy,
      prefix: f.prefix.trim(),
      padding: Number(f.padding),
      nextNumber: Number(f.nextNumber),
    };
    void s.act(
      t('setup.num.saved'),
      () => saveSeries(s.client!, body, key.keyFor(JSON.stringify(body))),
      close,
    );
  }

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.setupNumbering') }} />
      <Text style={k.title}>{t('setup.num.title')}</Text>
      <Text style={k.sub}>{t('setup.num.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Chips
        options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
        value={branch}
        onChange={(v) => (close(), setBranchId(v))}
      />
      <Chips
        options={(years.data ?? []).map((y) => ({ value: y.label, label: y.label }))}
        value={fy}
        onChange={(v) => (close(), setFyPick(v))}
      />
      <Gate q={list} ns="setup" emptyKey="setup.num.empty" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((x) => (
          <View key={x.id} style={k.card}>
            <Text style={k.name}>{nice(x.docType)}</Text>
            <Text style={k.sub}>
              {t('setup.num.line', {
                prefix: x.prefix,
                padding: x.padding,
                next: x.nextExample,
                issued: x.issued,
              })}
            </Text>
            {manage && x.issued === 0 && edit?.id !== x.id ? (
              <Button
                kind="ghost"
                label={`${t('setup.edit')} ${nice(x.docType)}`}
                onPress={() => (
                  close(),
                  setEdit(x),
                  setF({ prefix: x.prefix, padding: String(x.padding), nextNumber: String(x.nextNumber) })
                )}
              />
            ) : null}
            {x.issued > 0 ? <Text style={k.sub}>{t('setup.num.frozen', { n: x.issued })}</Text> : null}
            {edit?.id === x.id ? (
              <>
                <Field
                  label={t('setup.num.prefix')}
                  value={f.prefix}
                  onChange={(v) => setF({ ...f, prefix: v })}
                  autoCapitalize="characters"
                  error={bad('prefix')}
                />
                <Field
                  label={t('setup.num.padding')}
                  value={f.padding}
                  onChange={(v) => setF({ ...f, padding: v })}
                  keyboard="numeric"
                  error={bad('padding')}
                />
                <Field
                  label={t('setup.num.next')}
                  value={f.nextNumber}
                  onChange={(v) => setF({ ...f, nextNumber: v })}
                  keyboard="numeric"
                  error={bad('next')}
                />
                {bad('length') ? <Text style={k.error}>{bad('length')}</Text> : null}
                <View style={k.row}>
                  <Button label={t('setup.save')} disabled={s.busy} onPress={save} />
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
