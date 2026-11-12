import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Check, Field } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { Chips } from '../admin/kit';
import {
  P,
  admKey,
  fetchFieldCfg,
  fetchMenuCfg,
  fetchScreens,
  saveFieldCfg,
  saveMenuCfg,
  type FieldCfg,
  type MenuCfg,
} from './api';
import { Banner, Card, PartFailed, k, useAccess, useRun } from './kit';
import { LABEL_LANGS, draftOf, mergeLabels, type LabelDraft } from './logic';

const LANG_NAME: Record<string, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };
const orderOk = (v: string) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 999);
const orderValue = (v: string) => (v === '' ? null : Number(v));

function LabelInputs({
  draft,
  onChange,
  prefix,
}: {
  draft: LabelDraft;
  onChange: (d: LabelDraft) => void;
  prefix: string;
}) {
  return (
    <>
      {LABEL_LANGS.map((l) => (
        <Field
          key={l}
          label={`${prefix} - ${LANG_NAME[l]}`}
          value={draft[l]}
          onChange={(v) => onChange({ ...draft, [l]: v.slice(0, 80) })}
        />
      ))}
    </>
  );
}

interface FieldDraft {
  visible: boolean;
  required: boolean;
  labels: LabelDraft;
  order: string;
}
const fromField = (f: FieldCfg): FieldDraft => ({
  visible: f.visible,
  required: f.required === true,
  labels: draftOf(f.labels),
  order: f.sortOrder === null ? '' : String(f.sortOrder),
});

function FieldsPanel({
  canSave,
  run,
  userId,
}: {
  canSave: boolean;
  run: ReturnType<typeof useRun>;
  userId: string;
}) {
  const { t } = useTranslation();
  const { client } = useAccess();
  const [screen, setScreen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({});

  const screens = useQuery({
    queryKey: admKey(userId, 'cfg-screens'),
    queryFn: ({ signal }) => fetchScreens(client!, signal),
    retry: false,
  });
  const current = screen ?? screens.data?.items[0]?.screen ?? null;
  const cfg = useQuery({
    queryKey: admKey(userId, 'cfg-fields', current),
    queryFn: ({ signal }) => fetchFieldCfg(client!, current!, signal),
    enabled: current !== null,
    retry: false,
  });

  if (screens.error)
    return (
      <PartFailed error={screens.error} offline={t('cfg.offline')} onRetry={() => void screens.refetch()} />
    );
  if (screens.isPending) return <Text style={k.sub}>{t('common.loading')}</Text>;
  if (screens.data.items.length === 0) return <Text style={k.sub}>{t('cfg.noScreens')}</Text>;

  const fields = cfg.data?.fields ?? [];
  const draftFor = (f: FieldCfg) => drafts[f.field] ?? fromField(f);
  const setDraft = (f: FieldCfg, d: FieldDraft) => setDrafts((all) => ({ ...all, [f.field]: d }));
  const allValid = fields.every((f) => orderOk(draftFor(f).order));
  const dirty = Object.keys(drafts).length > 0;

  const payload = fields.map((f) => {
    const d = draftFor(f);
    return {
      field: f.field,
      ...(f.locked
        ? {}
        : { visible: d.visible ? null : false, required: d.visible && d.required ? true : null }),
      labels: mergeLabels(f.labels, d.labels),
      sortOrder: orderValue(d.order),
    };
  });

  return (
    <>
      <Chips
        label={t('cfg.screen')}
        value={current ?? ''}
        onChange={(s) => {
          setScreen(s);
          setDrafts({});
        }}
        options={screens.data.items.map((s): [string, string] => [s.screen, s.screen])}
      />
      {cfg.isPending && cfg.fetchStatus !== 'idle' ? <Text style={k.sub}>{t('common.loading')}</Text> : null}
      {cfg.error ? (
        <PartFailed error={cfg.error} offline={t('cfg.offline')} onRetry={() => void cfg.refetch()} />
      ) : null}
      {fields.map((f) => {
        const d = draftFor(f);
        return (
          <Card key={f.field}>
            <Text style={k.name}>{f.label}</Text>
            {f.locked ? <Text style={k.sub}>{t('cfg.locked')}</Text> : null}
            {!f.locked ? (
              <>
                <Check
                  label={`${f.label}: ${t('cfg.shown')}`}
                  value={d.visible}
                  onChange={(v) =>
                    canSave && setDraft(f, { ...d, visible: v, required: v ? d.required : false })
                  }
                />
                <Check
                  label={`${f.label}: ${t('cfg.required')}`}
                  value={d.required}
                  onChange={(v) =>
                    canSave && setDraft(f, { ...d, required: v, visible: v ? true : d.visible })
                  }
                />
              </>
            ) : null}
            <Field
              label={`${f.label}: ${t('cfg.order')}`}
              value={d.order}
              keyboard="number-pad"
              onChange={(v) => canSave && setDraft(f, { ...d, order: v })}
              error={orderOk(d.order) ? null : t('cfg.badOrder')}
            />
            {canSave ? (
              <LabelInputs
                prefix={f.label}
                draft={d.labels}
                onChange={(labels) => setDraft(f, { ...d, labels })}
              />
            ) : null}
          </Card>
        );
      })}
      {canSave && fields.length > 0 ? (
        <Button
          label={t('cfg.saveFields')}
          disabled={run.busy || !dirty || !allValid}
          onPress={() =>
            void run
              .run(
                () =>
                  saveFieldCfg(
                    client!,
                    current!,
                    payload,
                    run.idem.keyFor(`fields|${current}|${JSON.stringify(payload)}`),
                  ),
                t('cfg.fieldsSaved'),
                ['cfg-fields'],
              )
              .then((ok) => ok && setDrafts({}))
          }
        />
      ) : null}
    </>
  );
}

interface MenuDraft {
  labels: LabelDraft;
  order: string;
}

function MenuPanel({
  canSave,
  run,
  userId,
}: {
  canSave: boolean;
  run: ReturnType<typeof useRun>;
  userId: string;
}) {
  const { t } = useTranslation();
  const { client } = useAccess();
  const [drafts, setDrafts] = useState<Record<string, MenuDraft>>({});
  const menu = useQuery({
    queryKey: admKey(userId, 'cfg-menu'),
    queryFn: ({ signal }) => fetchMenuCfg(client!, signal),
    retry: false,
  });

  if (menu.error)
    return <PartFailed error={menu.error} offline={t('cfg.offline')} onRetry={() => void menu.refetch()} />;
  if (menu.isPending) return <Text style={k.sub}>{t('common.loading')}</Text>;
  const items = menu.data.items;
  const draftFor = (m: MenuCfg): MenuDraft =>
    drafts[m.key] ?? { labels: draftOf(m.labels), order: String(m.sortOrder) };
  const allValid = items.every((m) => orderOk(draftFor(m).order));
  const payload = items.map((m) => {
    const d = draftFor(m);
    return { key: m.key, labels: mergeLabels(m.labels, d.labels), sortOrder: orderValue(d.order) };
  });

  return (
    <>
      <Text style={k.sub}>{t('cfg.menuHint')}</Text>
      {items.length === 0 ? <Text style={k.sub}>{t('cfg.noMenu')}</Text> : null}
      {items.map((m) => {
        const d = draftFor(m);
        return (
          <Card key={m.key}>
            <Text style={k.name}>{m.label}</Text>
            <Field
              label={`${m.label}: ${t('cfg.order')}`}
              value={d.order}
              keyboard="number-pad"
              onChange={(v) => canSave && setDrafts((all) => ({ ...all, [m.key]: { ...d, order: v } }))}
              error={orderOk(d.order) ? null : t('cfg.badOrder')}
            />
            {canSave ? (
              <LabelInputs
                prefix={m.label}
                draft={d.labels}
                onChange={(labels) => setDrafts((all) => ({ ...all, [m.key]: { ...d, labels } }))}
              />
            ) : null}
          </Card>
        );
      })}
      {canSave && items.length > 0 ? (
        <Button
          label={t('cfg.saveMenu')}
          disabled={run.busy || Object.keys(drafts).length === 0 || !allValid}
          onPress={() =>
            void run
              .run(
                () => saveMenuCfg(client!, payload, run.idem.keyFor(`menu|${JSON.stringify(payload)}`)),
                t('cfg.menuSaved'),
                ['cfg-menu'],
              )
              .then((ok) => ok && setDrafts({}))
          }
        />
      ) : null}
    </>
  );
}

/** Field and menu configuration. Anyone signed in may read it; saving needs org.settings.manage (the server decides). */
export default function ConfigurationScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const run = useRun(userId);
  const [part, setPart] = useState<'fields' | 'menu'>('fields');
  if (!can(P.session)) return <StateView state="denied" message={t('cfg.denied')} />;
  if (client === null || userId === '') return <StateView state="loading" />;
  const canSave = can(P.settings);

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('cfg.title')}</Text>
      <Text style={k.sub}>{canSave ? t('cfg.hint') : t('cfg.viewOnly')}</Text>
      <Banner msg={run.msg} failure={run.failure} />
      <Chips
        label={t('cfg.part')}
        value={part}
        onChange={setPart}
        options={[
          ['fields', t('cfg.fields')],
          ['menu', t('cfg.menu')],
        ]}
      />
      {part === 'fields' ? (
        <FieldsPanel canSave={canSave} run={run} userId={userId} />
      ) : (
        <MenuPanel canSave={canSave} run={run} userId={userId} />
      )}
      <Text style={k.sub}>{t('cfg.notBuilt')}</Text>
    </ScrollView>
  );
}
