import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey } from './api';
import { G4P, createShelfCheck, fetchWarehouses, openCountDraft, type ShelfCheck } from './api-g4';
import { SHELF_TYPES, pickScan, type PickedFile } from './file-g4';
import { units } from './fmt';

export default function ShelfCheckScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const kRun = useActionKey();
  const kCount = useActionKey();
  const [wh, setWh] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [out, setOut] = useState<ShelfCheck | null>(null);
  const allowed = s.can(AP.digest) && s.can(G4P.shelf);
  const whs = useQuery({
    queryKey: akey(s.userId, 'warehouses'),
    queryFn: ({ signal }) => fetchWarehouses(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const cur = wh || whs.data?.[0]?.id || '';
  async function choose() {
    setFileMsg(null);
    const r = await pickScan(SHELF_TYPES);
    if (r.ok) setFile(r.file);
    else setFileMsg(t(r.reason === 'TOO_BIG' ? 'ai.sc.tooBig' : 'ai.sc.notAllowed'));
  }
  function run() {
    if (!file || !cur) return;
    const body = { warehouseId: cur, image: file.base64, mediaType: file.mediaType };
    void s.act(
      t('ai.sh.done'),
      async () =>
        setOut(await createShelfCheck(s.client!, body, kRun.keyFor(`${cur}|${file.name}|${file.bytes}`))),
      () => kRun.reset(),
    );
  }
  function draft() {
    if (!out) return;
    void s.act(
      t('ai.sh.opened'),
      async () => {
        await openCountDraft(s.client!, out.id, kCount.keyFor(out.id));
        setOut({ ...out, countId: 'opened' });
      },
      () => kCount.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page}>
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiShelf') }} />
      <Text style={k.title}>{t('ai.sh.title')}</Text>
      <Text style={k.sub}>{t('ai.sh.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(whs.data ?? []).length > 1 ? (
        <Chips
          options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
          value={cur}
          onChange={setWh}
        />
      ) : null}
      <Button kind="ghost" label={file ? t('ai.sc.change') : t('ai.sh.pick')} onPress={() => void choose()} />
      {file ? (
        <Text style={k.sub}>{t('ai.sc.chosen', { name: file.name, kb: Math.round(file.bytes / 1024) })}</Text>
      ) : null}
      {fileMsg ? <Text style={k.error}>{fileMsg}</Text> : null}
      <Button label={t('ai.sh.run')} disabled={s.busy || !file || !cur} onPress={run} />
      {out ? (
        <>
          <Text style={k.warn}>{out.note ?? t('ai.sh.estimate')}</Text>
          {out.rows.map((r, i) => (
            <View key={`${r.skuId ?? r.name}-${i}`} style={k.card}>
              <Text style={k.name}>{r.name}</Text>
              <Text style={r.flag === 'MATCH' ? k.ok : k.warn}>{t(`ai.sh.flag.${r.flag}`)}</Text>
              <Text style={k.sub}>
                {t('ai.sh.counts', { est: units(r.estimated), sys: units(r.systemQty) })}
              </Text>
            </View>
          ))}
          {s.can(G4P.countDraft) && out.countCandidates.length > 0 && !out.countId ? (
            <Button kind="ghost" label={t('ai.sh.openCount')} disabled={s.busy} onPress={draft} />
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
