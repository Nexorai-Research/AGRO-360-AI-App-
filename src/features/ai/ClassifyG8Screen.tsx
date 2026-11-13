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
import { akey, fetchBranchRefs } from './api';
import { DOC_CLASSES, G8, classifyFile, confirmClassify, type ClassifyDoc, type DocClass } from './api-g8';
import { pickDocument } from './file-g8';

export default function ClassifyG8Screen() {
  const { t } = useTranslation();
  const s = useSal();
  const kUp = useActionKey();
  const kOk = useActionKey();
  const [file, setFile] = useState<{ name: string; bytes: number; base64: string } | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [branch, setBranch] = useState('');
  const [doc, setDoc] = useState<ClassifyDoc | null>(null);
  const [cat, setCat] = useState<DocClass | ''>('');
  const allowed = s.can(G8.assistant) && s.can(G8.documents);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const br = branch || branches.data?.[0]?.id || '';
  const suggested = (DOC_CLASSES as readonly string[]).includes(doc?.suggestion?.category ?? '')
    ? (doc!.suggestion!.category as DocClass)
    : '';
  const chosen = cat || suggested;
  async function choose() {
    setFileMsg(null);
    const r = await pickDocument();
    if (r.ok) {
      setFile({ name: r.name, bytes: r.bytes, base64: r.base64 });
      setDoc(null);
      setCat('');
    } else if (r.reason === 'TOO_BIG') setFileMsg(t('ai.cl.tooBig'));
    else if (r.reason === 'NOT_READ') setFileMsg(t('ai.cl.notRead'));
  }
  function upload() {
    if (!file || !br) return;
    const body = { branchId: br, filename: file.name, contentBase64: file.base64 };
    void s.act(
      t('ai.cl.read'),
      async () =>
        setDoc(
          (await classifyFile(s.client!, body, kUp.keyFor(`${br}|${file.name}|${file.bytes}`))).document,
        ),
      () => kUp.reset(),
    );
  }
  function confirm() {
    if (!doc || !chosen) return;
    void s.act(
      t('ai.cl.filed'),
      async () =>
        setDoc(
          (
            await confirmClassify(
              s.client!,
              doc.id,
              { expectedVersion: doc.version, category: chosen },
              kOk.keyFor(`${doc.id}|${doc.version}|${chosen}`),
            )
          ).document,
        ),
      () => kOk.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page}>
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiClassify') }} />
      <Text style={k.title}>{t('ai.cl.title')}</Text>
      <Text style={k.sub}>{t('ai.cl.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={br}
          onChange={setBranch}
        />
      ) : null}
      <Button kind="ghost" label={file ? t('ai.cl.change') : t('ai.cl.pick')} onPress={() => void choose()} />
      {file ? (
        <Text style={k.sub}>{t('ai.cl.chosen', { name: file.name, kb: Math.round(file.bytes / 1024) })}</Text>
      ) : null}
      {fileMsg ? <Text style={k.error}>{fileMsg}</Text> : null}
      <Button label={t('ai.cl.upload')} disabled={s.busy || !file || !br} onPress={upload} />
      {doc ? (
        <View style={k.card}>
          <Text style={k.name}>{doc.filename}</Text>
          {doc.suggestion ? (
            <>
              <Text style={k.sub}>
                {t('ai.cl.suggested', {
                  cat: doc.suggestion.category
                    ? t(`ai.cl.cat.${doc.suggestion.category}`, { defaultValue: doc.suggestion.category })
                    : '-',
                })}
              </Text>
              {doc.suggestion.reason ? <Text style={k.sub}>{doc.suggestion.reason}</Text> : null}
              {doc.suggestion.note ? <Text style={k.warn}>{doc.suggestion.note}</Text> : null}
            </>
          ) : null}
          {doc.status === 'REVIEW' ? (
            <>
              <Text style={k.sub}>{t('ai.cl.pickCat')}</Text>
              <Chips
                options={DOC_CLASSES.map((x) => ({ value: x, label: t(`ai.cl.cat.${x}`) }))}
                value={chosen}
                onChange={(v) => setCat(v as DocClass)}
              />
              <Button label={t('ai.cl.file')} disabled={s.busy || !chosen} onPress={confirm} />
            </>
          ) : (
            <Text style={k.ok}>
              {t('ai.cl.done', {
                cat: doc.result?.category
                  ? t(`ai.cl.cat.${doc.result.category}`, { defaultValue: doc.result.category })
                  : '-',
              })}
            </Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
