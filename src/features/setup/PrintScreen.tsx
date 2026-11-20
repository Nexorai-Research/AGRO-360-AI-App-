import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  FLAGS,
  PAPERS,
  SP,
  deleteTemplate,
  fetchTemplateList,
  restoreTemplate,
  saveTemplate,
  skey,
  type Flag,
  type PrintTemplate,
} from './api';
import { previewTemplate } from './print-preview';
import { NON_HIDEABLE, buildTemplate, templateErrors, templateToForm, type TemplateForm } from './logic';

const nice = (d: string) => d.replace(/_/g, ' ').toLowerCase();

export default function PrintScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [edit, setEdit] = useState<PrintTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [restore, setRestore] = useState('');
  const ok = s.ready && s.can(SP.view);
  const all = useQuery({
    queryKey: skey(s.userId, 'templates-list'),
    queryFn: ({ signal }) => fetchTemplateList(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const list = { ...all, data: all.data?.items } as typeof all & { data: PrintTemplate[] | undefined };
  if (!s.can(SP.view)) return <StateView state="denied" message={t('setup.denied')} />;
  const manage = s.can(SP.print);
  const removed = all.data?.removed ?? [];

  function close() {
    setEdit(null);
    setForm(null);
    key.reset();
  }
  const locked = (flag: Flag) => edit !== null && (NON_HIDEABLE[edit.docType] ?? []).includes(flag);
  function save() {
    if (!edit || !form || templateErrors(form).length > 0) return;
    const body = buildTemplate(edit.docType, form);
    void s.act(
      t('setup.print.saved'),
      () =>
        saveTemplate(
          s.client!,
          edit.version,
          body,
          key.keyFor(`${edit.docType}|${edit.version}|${JSON.stringify(body)}`),
        ),
      close,
    );
  }

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={all.isRefetching} onRefresh={() => void all.refetch()} />}
    >
      <Text style={k.title}>{t('setup.print.title')}</Text>
      <Text style={k.sub}>{t('setup.print.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {manage && removed.length > 0 ? (
        <View style={k.card}>
          <Text style={k.name}>{t('wp16.tpl.addBack')}</Text>
          <Text style={k.sub}>{t('wp16.tpl.addBackHint')}</Text>
          <Chips
            options={removed.map((d) => ({ value: d, label: nice(d) }))}
            value={restore}
            onChange={setRestore}
          />
          <Button
            label={t('wp16.tpl.addBack')}
            disabled={s.busy || !removed.includes(restore)}
            onPress={() =>
              void s.act(
                t('wp16.tpl.addedBack'),
                () => restoreTemplate(s.client!, restore, key.keyFor(`restore-tpl|${restore}`)),
                () => (setRestore(''), key.reset()),
              )
            }
          />
        </View>
      ) : null}
      <Gate q={list} ns="setup" emptyKey="setup.print.empty" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((x) => (
          <View key={x.docType} style={k.card}>
            <Text style={k.name}>{nice(x.docType)}</Text>
            <Text style={k.sub}>
              {t(`setup.print.paper.${x.paper}`)} ·{' '}
              {t(x.isDefault ? 'setup.print.default' : 'setup.print.custom')}
            </Text>
            {manage && edit?.docType !== x.docType ? (
              <Button
                kind="ghost"
                label={`${t('setup.edit')} ${nice(x.docType)}`}
                onPress={() => (close(), setEdit(x), setForm(templateToForm(x)))}
              />
            ) : null}
            {manage ? (
              <Button
                kind="ghost"
                label={`${t('wp3.print.preview')} ${nice(x.docType)}`}
                disabled={s.busy}
                onPress={() =>
                  void s.act(t('wp3.print.ready'), async () => {
                    if ((await previewTemplate(s.client!, x.docType)) === 'noSharing')
                      throw new Error('NO_SHARE');
                  })
                }
              />
            ) : null}
            {manage && removing !== x.docType && edit?.docType !== x.docType ? (
              <Button
                kind="ghost"
                label={`${t('wp16.tpl.delete')} ${nice(x.docType)}`}
                onPress={() => (close(), setRemoving(x.docType))}
              />
            ) : null}
            {manage && removing === x.docType ? (
              <>
                <Text style={k.sub}>{t('wp16.tpl.deleteWhat', { doc: nice(x.docType) })}</Text>
                <View style={k.row}>
                  <Button
                    label={t('wp16.tpl.confirmDelete')}
                    disabled={s.busy}
                    onPress={() =>
                      void s.act(
                        t('wp16.tpl.deleted'),
                        () =>
                          deleteTemplate(
                            s.client!,
                            x.docType,
                            key.keyFor(`delete-tpl|${x.docType}|${x.version}`),
                          ),
                        () => (setRemoving(null), key.reset()),
                      )
                    }
                  />
                  <Button kind="ghost" label={t('setup.cancel')} onPress={() => setRemoving(null)} />
                </View>
              </>
            ) : null}
            {edit?.docType === x.docType && form ? (
              <>
                <Chips
                  options={PAPERS.map((p) => ({ value: p, label: t(`setup.print.paper.${p}`) }))}
                  value={form.paper}
                  onChange={(v) => setForm({ ...form, paper: v as TemplateForm['paper'] })}
                />
                {FLAGS.map((fl) => (
                  <View key={fl}>
                    <Text style={k.label}>
                      {t(`setup.print.flag.${fl}`)}
                      {locked(fl) ? ` (${t('setup.print.cannotHide')})` : ''}
                    </Text>
                    <Chips
                      options={[
                        { value: 'on', label: t('setup.on') },
                        { value: 'off', label: t('setup.off') },
                      ]}
                      value={form.flags[fl] ? 'on' : 'off'}
                      onChange={(v) => {
                        if (locked(fl) && v === 'off') return;
                        setForm({ ...form, flags: { ...form.flags, [fl]: v === 'on' } });
                      }}
                    />
                  </View>
                ))}
                <Field
                  label={t('setup.print.terms')}
                  value={form.terms}
                  onChange={(v) => setForm({ ...form, terms: v })}
                  multiline
                  error={templateErrors(form).includes('terms') ? t('setup.print.v.terms') : null}
                />
                <Field
                  label={t('setup.print.footer')}
                  value={form.footer}
                  onChange={(v) => setForm({ ...form, footer: v })}
                  error={templateErrors(form).includes('footer') ? t('setup.print.v.footer') : null}
                />
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
