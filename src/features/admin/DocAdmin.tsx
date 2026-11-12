import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Field } from '@/ui/kit';
import { Button } from '@/ui/Button';
import { DOC_CATEGORIES, type DocumentView } from './api';
import { Card, Chips, isNetwork, k } from './kit';
import { fmtWhen, formatBytes } from './logic';
import { Result, useRunner } from './usr-run';
import { fetchDocContent, fetchDocDashboard, fetchDocVersions, replaceDocument, uploadDocument } from './usr-api';
import { DOC_MAX_BYTES, extensionOk, validDocTitle, validExpiry } from './usr-logic';
import { pickFile, saveAndShare, type PickedFile } from './usr-files';

/** Counts by status (GET /documents/dashboard). A failure here never hides the list. */
export function DocDashboard({ client, userId, status, onPick }: { client: ApiClient; userId: string; status: string; onPick: (s: string) => void }) {
  const { t } = useTranslation();
  const d = useQuery({
    queryKey: ['admin', userId, 'doc-dash'],
    queryFn: ({ signal }) => fetchDocDashboard(client, signal),
    retry: false,
  });
  if (!d.data?.byStatus) return null;
  const tile = (label: string, n: number, s: string) => (
    <Button key={s} kind={status === s ? 'primary' : 'ghost'} label={`${label}: ${n}`} onPress={() => onPick(s)} />
  );
  return (
    <View style={{ gap: 6 }}>
      {tile(t('documents.all'), d.data.total, '')}
      {tile(t('documents.status.ACTIVE'), d.data.byStatus.ACTIVE ?? 0, 'ACTIVE')}
      {tile(t('documents.status.EXPIRING_SOON'), d.data.byStatus.EXPIRING_SOON ?? 0, 'EXPIRING_SOON')}
      {tile(t('documents.status.EXPIRED'), d.data.byStatus.EXPIRED ?? 0, 'EXPIRED')}
    </View>
  );
}

/** Checks a picked file before it is sent: type and the 4 MB limit. Returns a translation key for the problem, or null. */
export function fileProblem(f: PickedFile): string | null {
  if (!extensionOk(f.name)) return 'dcm.badType';
  const size = f.size ?? Math.floor((f.base64.length * 3) / 4);
  return size > DOC_MAX_BYTES ? 'dcm.tooBig' : null;
}

function FilePick({ file, onPick }: { file: PickedFile | null; onPick: (f: PickedFile) => void }) {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const problem = file ? fileProblem(file) : null;
  return (
    <View style={{ gap: 6 }}>
      <Button
        kind="ghost"
        label={file ? t('dcm.chooseOther') : t('dcm.choose')}
        onPress={() => {
          setErr(null);
          pickFile()
            .then((f) => f && onPick(f))
            .catch(() => setErr(t('dcm.pickFailed')));
        }}
      />
      {file ? (
        <Text style={k.sub}>
          {file.name}
          {file.size ? ` · ${formatBytes(file.size)}` : ''}
        </Text>
      ) : null}
      {problem ? <Text style={k.error}>{t(problem)}</Text> : null}
      {err ? <Text style={k.error}>{err}</Text> : null}
    </View>
  );
}

export function UploadForm({ client, onDone, onCancel }: { client: ApiClient; onDone: (m: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const r = useRunner();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  const shownTitle = title.trim() || (file?.name ?? '');
  const bad = !file || fileProblem(file) !== null || !validDocTitle(shownTitle) || !validExpiry(expiresOn.trim());
  const submit = () => {
    setTouched(true);
    if (bad || !file) return;
    const body = {
      title: shownTitle,
      category,
      expiresOn: expiresOn.trim() || null,
      notes: notes.trim() || null,
      filename: file.name,
      contentBase64: file.base64,
    };
    // the content is part of the action: a different file is a different action with a new key
    const fp = `doc-up|${body.title}|${category}|${body.expiresOn}|${body.notes}|${file.name}|${file.base64.length}`;
    void r.run(() => uploadDocument(client, body, r.idem.keyFor(fp)), t('dcm.uploaded')).then((ok) => ok && onDone(t('dcm.uploaded')));
  };
  return (
    <Card>
      <Text style={k.h2}>{t('dcm.uploadTitle')}</Text>
      <Text style={k.sub}>{t('dcm.uploadHint')}</Text>
      <Result msg={r.msg} failure={r.failure} />
      <FilePick file={file} onPick={setFile} />
      {touched && !file ? <Text style={k.error}>{t('dcm.needFile')}</Text> : null}
      <Field label={t('dcm.titleLabel')} value={title} onChange={setTitle} placeholder={file?.name} error={touched && !validDocTitle(shownTitle) ? t('dcm.badTitle') : null} />
      <Chips
        value={category}
        label={t('documents.categoryFilter')}
        onChange={setCategory}
        options={DOC_CATEGORIES.map((c): [string, string] => [c, t(`documents.category.${c}`)])}
      />
      <Field label={t('dcm.expiry')} value={expiresOn} onChange={setExpiresOn} placeholder="YYYY-MM-DD" error={touched && !validExpiry(expiresOn.trim()) ? t('dcm.badExpiry') : null} />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        accessibilityLabel={t('dcm.notes')}
        placeholder={t('dcm.notes')}
        style={k.input}
        multiline
        maxLength={1000}
      />
      <Button label={t('dcm.upload')} disabled={r.busy} onPress={submit} />
      <Button kind="ghost" label={t('usr.cancel')} onPress={onCancel} />
    </Card>
  );
}

/** Download, versions and replace for one document. Download and versions need org.document.view, replace needs org.document.manage. */
export function DocActions({
  client,
  doc,
  canManage,
  onChanged,
}: {
  client: ApiClient;
  doc: DocumentView;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const r = useRunner();
  const [showVersions, setShowVersions] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [noShare, setNoShare] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const versions = useQuery({
    queryKey: ['admin', 'doc-versions', doc.id, doc.currentVersion],
    queryFn: ({ signal }) => fetchDocVersions(client, doc.id, signal),
    enabled: showVersions,
    retry: false,
  });

  async function download(version?: number) {
    await r.run(async () => {
      const f = await fetchDocContent(client, doc.id, version);
      setNoShare(!(await saveAndShare(f.filename, f.contentType, f.contentBase64)));
    }, t('dcm.downloaded'));
  }

  const problem = file ? fileProblem(file) : null;
  return (
    <View style={{ gap: 8 }}>
      <Result msg={r.msg} failure={r.failure} />
      {noShare ? <Text style={k.sub}>{t('dcm.noShare')}</Text> : null}
      <Button kind="ghost" label={t('dcm.download')} disabled={r.busy} onPress={() => void download()} />
      <Button kind="ghost" label={showVersions ? t('dcm.hideVersions') : t('dcm.versions')} onPress={() => setShowVersions(!showVersions)} />
      {showVersions && versions.isPending ? <Text style={k.sub}>{t('common.loading')}</Text> : null}
      {showVersions && versions.error ? (
        <>
          <Text style={k.sub}>{isNetwork(versions.error) ? t('documents.offline') : t('dcm.versionsUnavailable')}</Text>
          <Button kind="ghost" label={t('common.retry')} onPress={() => void versions.refetch()} />
        </>
      ) : null}
      {showVersions && versions.data && versions.data.items.length === 0 ? <Text style={k.sub}>{t('dcm.noVersions')}</Text> : null}
      {showVersions
        ? versions.data?.items.map((v) => (
            <View key={v.version} style={{ gap: 4 }}>
              <Text style={k.name}>
                {t('documents.version', { n: v.version })}
                {v.version === doc.currentVersion ? ` (${t('dcm.current')})` : ''}
              </Text>
              <Text style={k.sub}>
                {v.filename} · {formatBytes(v.sizeBytes)} · {fmtWhen(v.uploadedAt)}
              </Text>
              <Button kind="ghost" label={t('dcm.downloadVersion', { n: v.version })} disabled={r.busy} onPress={() => void download(v.version)} />
            </View>
          ))
        : null}
      {canManage && !replacing ? <Button kind="ghost" label={t('dcm.replace')} onPress={() => (setReplacing(true), r.clear())} /> : null}
      {canManage && replacing ? (
        <View style={{ gap: 8 }}>
          <Text style={k.sub}>{t('dcm.replaceHint', { n: doc.currentVersion })}</Text>
          <FilePick file={file} onPick={setFile} />
          <Button
            label={t('dcm.replaceNow')}
            disabled={r.busy || !file || problem !== null}
            onPress={() => {
              if (!file) return;
              const body = { filename: file.name, contentBase64: file.base64 };
              void r
                .run(
                  () => replaceDocument(client, doc.id, body, r.idem.keyFor(`doc-rep|${doc.id}|${file.name}|${file.base64.length}`)),
                  t('dcm.replaced'),
                )
                .then((ok) => {
                  if (ok) {
                    setReplacing(false);
                    setFile(null);
                    onChanged();
                  }
                });
            }}
          />
          <Button kind="ghost" label={t('usr.cancel')} onPress={() => (setReplacing(false), setFile(null))} />
        </View>
      ) : null}
    </View>
  );
}
