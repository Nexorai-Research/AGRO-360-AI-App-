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
import { saveAndShare } from '../admin/usr-files';
import { XP, fetchExports, fetchMappings, runExport, saveMappings, xkey } from './fx-api';
import { exportErrors, mappingItems, validLedgerName } from './fx-logic';

const b64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export default function ExportScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const mapKey = useActionKey();
  const y = new Date().getFullYear();
  const [format, setFormat] = useState('GENERIC');
  const [from, setFrom] = useState(`${y}-04-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [tried, setTried] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const ok = s.ready && s.can(XP.exportRun);
  const maps = useQuery({
    queryKey: xkey(s.userId, 'maps'),
    queryFn: ({ signal }) => fetchMappings(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const hist = useQuery({
    queryKey: xkey(s.userId, 'exports'),
    queryFn: ({ signal }) => fetchExports(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(XP.exportRun)) return <StateView state="denied" message={t('fx.denied')} />;
  const errs = exportErrors(from, to);
  function run() {
    setTried(true);
    if (exportErrors(from, to).length > 0) return;
    const body = { format, from: from.trim(), to: to.trim() };
    void s.act(
      t('fx.export.done'),
      async () => {
        const r = await runExport(s.client!, body, key.keyFor(JSON.stringify(body)));
        const shared = await saveAndShare(r.fileName, r.contentType, b64(r.content));
        setNote(
          [
            r.replay ? t('fx.export.replay') : t('fx.export.lines', { n: r.rowCount }),
            shared ? '' : t('fx.export.noShare'),
            r.unmappedAccounts.length ? t('fx.export.unmapped', { list: r.unmappedAccounts.join(', ') }) : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
        return r;
      },
      () => (key.reset(), void hist.refetch()),
    );
  }
  function saveMap() {
    const items = mappingItems(names);
    if (items.length === 0 || items.some((i) => !validLedgerName(i.externalName))) return;
    void s.act(
      t('fx.export.mapSaved'),
      () => saveMappings(s.client!, items, mapKey.keyFor(JSON.stringify(items))),
      () => (setNames({}), mapKey.reset(), void maps.refetch()),
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={hist.isRefetching} onRefresh={() => void hist.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.finExport') }} />
      <Text style={k.title}>{t('fx.export.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {note ? <Notice tone="ok" text={note} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <View style={k.card}>
        <Text style={k.sub}>{t('fx.export.intro')}</Text>
        <Chips
          options={[
            { value: 'GENERIC', label: t('fx.export.generic') },
            { value: 'TALLY', label: t('fx.export.tally') },
          ]}
          value={format}
          onChange={setFormat}
        />
        <Field
          label={t('fx.export.from')}
          value={from}
          onChange={setFrom}
          error={tried && errs.includes('from') ? t('fx.v.date') : null}
        />
        <Field
          label={t('fx.export.to')}
          value={to}
          onChange={setTo}
          error={tried && errs.includes('to') ? t('fx.export.v.to') : null}
        />
        <Button label={t('fx.export.run')} disabled={s.busy} onPress={run} />
      </View>
      <Text style={k.title}>{t('fx.export.mapTitle')}</Text>
      <Gate q={maps} ns="fx" emptyKey="fx.export.noAccounts" isEmpty={(maps.data ?? []).length === 0}>
        {(maps.data ?? []).slice(0, 60).map((m) => (
          <Field
            key={m.accountId}
            label={`${m.code} ${m.name}`}
            value={names[m.accountId] ?? m.externalName ?? ''}
            onChange={(v) => setNames({ ...names, [m.accountId]: v })}
            error={validLedgerName(names[m.accountId] ?? '') ? null : t('fx.export.v.name')}
          />
        ))}
        <Button label={t('fx.export.saveMap')} disabled={s.busy} onPress={saveMap} />
      </Gate>
      <Text style={k.title}>{t('fx.export.history')}</Text>
      <Gate q={hist} ns="fx" emptyKey="fx.export.noHistory" isEmpty={(hist.data ?? []).length === 0}>
        {(hist.data ?? []).map((x) => (
          <View key={x.id} style={k.card}>
            <Text style={k.name}>
              {x.format} · {x.from} → {x.to}
            </Text>
            <Text style={k.sub}>
              {x.createdAt.slice(0, 16).replace('T', ' ')} · {t('fx.export.lines', { n: x.rowCount })}
            </Text>
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}
