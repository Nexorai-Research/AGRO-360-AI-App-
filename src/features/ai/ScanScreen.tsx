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
import { AP, akey, fetchBranchRefs } from './api';
import { G4P, confirmLabel, rejectOcr, uploadOcr, type OcrDocument, type OcrField } from './api-g4';
import { SCAN_TYPES, pickScan, type PickedFile } from './file-g4';

type Kind = 'PURCHASE_BILL' | 'LABEL';
const low = (f: OcrField | undefined, doc: OcrDocument, name: string) =>
  doc.validation.lowConfidence.includes(name) || (f ? f.confidence < 0.6 : false);

function FieldRows({
  fields,
  doc,
  prefix,
}: {
  fields: Record<string, OcrField>;
  doc: OcrDocument;
  prefix: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      {Object.entries(fields).map(([name, f]) => (
        <Text key={name} style={low(f, doc, `${prefix}${name}`) ? k.warn : k.sub}>
          {name}: {f.value ?? '-'} · {t('ai.sc.conf', { n: Math.round(f.confidence * 100) })}
          {low(f, doc, `${prefix}${name}`) ? ` · ${t('ai.sc.check')}` : ''}
        </Text>
      ))}
    </>
  );
}

/** One screen for a supplier bill (UC-266) and a product label (UC-G09): pick a file, see what was read with how sure it is, and decide. Nothing is posted or created here. */
export default function ScanScreen({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const s = useSal();
  const kUp = useActionKey();
  const kDec = useActionKey();
  const need = kind === 'PURCHASE_BILL' ? G4P.bill : G4P.label;
  const [branch, setBranch] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [doc, setDoc] = useState<OcrDocument | null>(null);
  const [dup, setDup] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const allowed = s.can(AP.digest) && s.can(need);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const br = branch || branches.data?.[0]?.id || '';
  async function choose() {
    setFileMsg(null);
    const r = await pickScan(SCAN_TYPES);
    if (r.ok) setFile(r.file);
    else if (r.reason === 'TOO_BIG') setFileMsg(t('ai.sc.tooBig'));
    else if (r.reason === 'NOT_ALLOWED') setFileMsg(t('ai.sc.notAllowed'));
  }
  function send() {
    if (!file || !br) return;
    const body = { branchId: br, filename: file.name, contentBase64: file.base64 };
    void s.act(
      t('ai.sc.read'),
      async () => {
        const r = await uploadOcr(
          s.client!,
          kind,
          body,
          kUp.keyFor(`${kind}|${br}|${file.name}|${file.bytes}`),
        );
        setDoc(r.document);
        setDup(r.duplicate);
        setDraft(null);
      },
      () => kUp.reset(),
    );
  }
  function reject() {
    if (!doc) return;
    void s.act(
      t('ai.sc.rejected'),
      async () =>
        setDoc(await rejectOcr(s.client!, doc.id, doc.version, kDec.keyFor(`rej|${doc.id}|${doc.version}`))),
      () => kDec.reset(),
    );
  }
  function confirm() {
    if (!doc) return;
    void s.act(
      t('ai.sc.confirmed'),
      async () => {
        const r = await confirmLabel(
          s.client!,
          doc.id,
          doc.version,
          kDec.keyFor(`ok|${doc.id}|${doc.version}`),
        );
        setDoc(r.document);
        setDraft(r.productDraft);
      },
      () => kDec.reset(),
    );
  }
  const errors = doc?.validation.issues.filter((i) => i.severity === 'ERROR') ?? [];
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          headerShown: true,
          title: t(kind === 'PURCHASE_BILL' ? 'nav.aiBillScan' : 'nav.aiLabelScan'),
        }}
      />
      <Text style={k.title}>{t(kind === 'PURCHASE_BILL' ? 'ai.sc.billTitle' : 'ai.sc.labelTitle')}</Text>
      <Text style={k.sub}>{t(kind === 'PURCHASE_BILL' ? 'ai.sc.billIntro' : 'ai.sc.labelIntro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={br}
          onChange={setBranch}
        />
      ) : null}
      <Button kind="ghost" label={file ? t('ai.sc.change') : t('ai.sc.pick')} onPress={() => void choose()} />
      {file ? (
        <Text style={k.sub}>{t('ai.sc.chosen', { name: file.name, kb: Math.round(file.bytes / 1024) })}</Text>
      ) : null}
      {fileMsg ? <Text style={k.error}>{fileMsg}</Text> : null}
      <Button label={t('ai.sc.send')} disabled={s.busy || !file || !br} onPress={send} />
      {doc ? (
        <>
          {dup ? <Text style={k.warn}>{t('ai.sc.duplicate')}</Text> : null}
          <View style={k.card}>
            <Text style={k.name}>{doc.filename}</Text>
            <Text style={k.sub}>
              {t(`ai.sc.status.${doc.status}`)} · {t('ai.sc.keep', { date: doc.retainUntil })}
            </Text>
            <FieldRows fields={doc.extracted.fields} doc={doc} prefix="" />
          </View>
          {doc.extracted.lines.map((l, i) => (
            <View key={i} style={k.card}>
              <Text style={k.name}>{t('ai.sc.line', { n: i + 1 })}</Text>
              <FieldRows fields={l} doc={doc} prefix={`lines[${i}].`} />
            </View>
          ))}
          {doc.validation.issues.length > 0 ? (
            <View style={k.card}>
              {doc.validation.issues.map((x, i) => (
                <Text key={i} style={x.severity === 'ERROR' ? k.error : k.warn}>
                  {x.field}: {x.message}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={k.ok}>{t('ai.sc.noIssues')}</Text>
          )}
          {doc.status === 'REVIEW' ? (
            <View style={k.row}>
              {kind === 'LABEL' ? (
                <Button
                  label={t('ai.sc.useDraft')}
                  disabled={s.busy || errors.length > 0}
                  onPress={confirm}
                />
              ) : null}
              <Button kind="ghost" label={t('ai.sc.reject')} disabled={s.busy} onPress={reject} />
            </View>
          ) : null}
          {draft ? (
            <View style={k.card}>
              <Text style={k.name}>{t('ai.sc.draftTitle')}</Text>
              {Object.entries(draft)
                .filter(([, v]) => v !== null && typeof v !== 'object')
                .map(([n, v]) => (
                  <Text key={n} style={k.sub}>
                    {n}: {String(v)}
                  </Text>
                ))}
              <Text style={k.sub}>{t('ai.sc.notCreated')}</Text>
            </View>
          ) : null}
          {kind === 'PURCHASE_BILL' ? <Text style={k.sub}>{t('ai.sc.billNote')}</Text> : null}
        </>
      ) : null}
    </ScrollView>
  );
}
