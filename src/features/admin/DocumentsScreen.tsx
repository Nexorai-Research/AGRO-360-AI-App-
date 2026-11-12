import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage, type ErrorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { DOC_CATEGORIES, DOC_STATUSES, PERM, adminKey, fetchDocuments, setDocumentActive } from './api';
import { DocActions, DocDashboard, UploadForm } from './DocAdmin';
import { Card, Chips, failText, isNetwork, k, queryState, useAccess, useIdemKey } from './kit';
import { formatBytes } from './logic';

/** List, upload, replace, versions and download. Files live in the server database for now (storage decision M02-OD-14 is open). */
export default function DocumentsScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const idem = useIdemKey();

  const docs = useInfiniteQuery({
    queryKey: adminKey(userId, 'documents', q, category, status),
    queryFn: ({ pageParam, signal }) => fetchDocuments(client!, { q, category, status }, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: client !== null && userId !== '' && can(PERM.docView),
    placeholderData: keepPreviousData,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  async function toggle(id: string, active: boolean) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await setDocumentActive(client!, id, active, idem.keyFor(`${active ? 'restore' : 'deactivate'}|${id}`));
      idem.clear();
      setMsg(t(active ? 'documents.restored' : 'documents.deactivated'));
      void qc.invalidateQueries({ queryKey: adminKey(userId, 'documents') });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!can(PERM.docView)) return <StateView state="denied" message={t('documents.denied')} />;
  const early = queryState(docs, t, t('documents.offline'));
  if (early) return early;
  const rows = docs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('documents.title')}</Text>
      {msg ? (
        <Text style={k.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {failure ? (
        <Text style={k.error} accessibilityRole="alert">
          {failText(t, failure)}
        </Text>
      ) : null}
      <DocDashboard client={client!} userId={userId} status={status} onPick={setStatus} />
      {can(PERM.docManage) ? (
        uploading ? (
          <UploadForm
            client={client!}
            onCancel={() => setUploading(false)}
            onDone={(m) => {
              setUploading(false);
              setMsg(m);
              void qc.invalidateQueries({ queryKey: adminKey(userId, 'documents') });
              void qc.invalidateQueries({ queryKey: adminKey(userId, 'doc-dash') });
            }}
          />
        ) : (
          <Button
            label={t('dcm.upload')}
            onPress={() => (setUploading(true), setMsg(null), setFailure(null))}
          />
        )
      ) : null}
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => setQ(text)}
        returnKeyType="search"
        accessibilityLabel={t('documents.search')}
        placeholder={t('documents.search')}
        style={k.input}
      />
      <Button kind="ghost" label={t('documents.searchNow')} onPress={() => setQ(text)} />
      <Chips
        value={status}
        label={t('documents.statusFilter')}
        onChange={setStatus}
        options={[
          ['', t('documents.all')],
          ...DOC_STATUSES.map((s): [string, string] => [s, t(`documents.status.${s}`)]),
        ]}
      />
      <Chips
        value={category}
        label={t('documents.categoryFilter')}
        onChange={setCategory}
        options={[
          ['', t('documents.allCategories')],
          ...DOC_CATEGORIES.map((c): [string, string] => [c, t(`documents.category.${c}`)]),
        ]}
      />
      {rows.length === 0 ? <StateView state="empty" message={t('documents.empty')} /> : null}
      {rows.map((d) => (
        <Card key={d.id}>
          <Text style={k.name}>{d.title}</Text>
          <Text style={k.sub}>
            {t(`documents.category.${d.category}`, { defaultValue: d.category })} ·{' '}
            {t(`documents.status.${d.status}`, { defaultValue: d.status })}
          </Text>
          <Text style={k.sub}>
            {d.filename} · {formatBytes(d.sizeBytes)} · {t('documents.version', { n: d.currentVersion })}
          </Text>
          {d.expiresOn ? <Text style={k.sub}>{t('documents.expires', { date: d.expiresOn })}</Text> : null}
          <Button
            kind="ghost"
            label={openId === d.id ? t('users.hide') : t('users.details')}
            onPress={() => setOpenId(openId === d.id ? null : d.id)}
          />
          {openId === d.id ? (
            <DocActions
              client={client!}
              doc={d}
              canManage={can(PERM.docManage)}
              onChanged={() => {
                void qc.invalidateQueries({ queryKey: adminKey(userId, 'documents') });
                void qc.invalidateQueries({ queryKey: adminKey(userId, 'doc-dash') });
              }}
            />
          ) : null}
          {can(PERM.docManage) ? (
            <Button
              kind="ghost"
              label={t(d.active ? 'documents.deactivate' : 'documents.restore')}
              disabled={busy}
              onPress={() => void toggle(d.id, !d.active)}
            />
          ) : null}
        </Card>
      ))}
      {docs.hasNextPage ? (
        <Button
          kind="ghost"
          label={t('documents.more')}
          disabled={docs.isFetchingNextPage}
          onPress={() => void docs.fetchNextPage()}
        />
      ) : null}
    </ScrollView>
  );
}
