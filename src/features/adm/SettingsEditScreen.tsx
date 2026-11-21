import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Check, Field } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { Chips } from '../admin/kit';
import {
  COMPANY_FIELDS,
  P,
  admKey,
  deleteMode,
  fetchCompanyFull,
  fetchModeLedgers,
  fetchModes,
  restoreMode,
  fetchPolicyView,
  saveCompany,
  saveMode,
  savePolicies,
  type CompanyField,
  type PayMode,
  type PolicyView,
  type SettingValue,
} from './api';
import { Banner, Card, PartFailed, k, useAccess, useRun } from './kit';
import { VPA_RE, companyErrors, companyPatch, validIsoDate } from './logic';

type Run = ReturnType<typeof useRun>;
const ENUM_VALUES = ['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP'];

function CompanyPanel({ run, userId }: { run: Run; userId: string }) {
  const { t } = useTranslation();
  const { client } = useAccess();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const q = useQuery({
    queryKey: admKey(userId, 'company-full'),
    queryFn: ({ signal }) => fetchCompanyFull(client!, signal),
    retry: false,
  });
  if (q.error)
    return <PartFailed error={q.error} offline={t('setEdit.offline')} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <Text style={k.sub}>{t('common.loading')}</Text>;
  const c = q.data;
  const orig = c as unknown as Record<string, string | null>;
  const values: Record<string, string> =
    form ?? Object.fromEntries(COMPANY_FIELDS.map((f) => [f, (orig[f] as string | null) ?? '']));
  const errs = companyErrors(values) as Record<string, true | undefined>;
  const patch = companyPatch(orig, values);
  const changed = Object.keys(patch).length > 0;
  const set = (f: CompanyField, v: string) => setForm({ ...values, [f]: v });

  return (
    <Card>
      <Text style={k.sub}>{t('setEdit.companyHint')}</Text>
      {COMPANY_FIELDS.map((f) => (
        <Field
          key={f}
          label={t(`setEdit.company.${f}`)}
          value={values[f] ?? ''}
          onChange={(v) => set(f, v)}
          keyboard={
            f === 'contactEmail'
              ? 'email-address'
              : f === 'contactPhone' || f === 'bankAccountNumber'
                ? 'phone-pad'
                : undefined
          }
          error={errs[f] ? t('setEdit.badValue') : null}
        />
      ))}
      <Button
        label={t('setEdit.saveCompany')}
        disabled={run.busy || !changed || Object.values(errs).some(Boolean)}
        onPress={() =>
          void run
            .run(
              () =>
                saveCompany(
                  client!,
                  c.version,
                  patch,
                  run.idem.keyFor(`company|${c.version}|${JSON.stringify(patch)}`),
                ),
              t('setEdit.companySaved'),
              ['company-full', 'company'],
            )
            .then((ok) => ok && setForm(null))
        }
      />
    </Card>
  );
}

function ModesPanel({ canEdit, run, userId }: { canEdit: boolean; run: Run; userId: string }) {
  const { t } = useTranslation();
  const { client } = useAccess();
  const [vpa, setVpa] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [restore, setRestore] = useState('');
  const q = useQuery({
    queryKey: admKey(userId, 'modes-full'),
    queryFn: ({ signal }) => fetchModes(client!, signal),
    retry: false,
  });
  // web parity 16: the ledger is shown by code and name; a role that may not read the chart of accounts sees the short id
  const ledgers = useQuery({
    queryKey: admKey(userId, 'mode-ledgers'),
    queryFn: ({ signal }) => fetchModeLedgers(client!, signal),
    retry: false,
  });
  if (q.error)
    return <PartFailed error={q.error} offline={t('setEdit.offline')} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <Text style={k.sub}>{t('common.loading')}</Text>;
  const refresh = ['modes-full', 'modes'];
  const ledgerLabel = (id: string | null) =>
    id ? (ledgers.data?.find((l) => l.id === id)?.label ?? `${id.slice(0, 8)}...`) : t('wp16.mode.noLedger');
  const removed = q.data.removed ?? [];
  const link = (m: PayMode, ledgerAccountId: string) =>
    void run
      .run(
        () =>
          saveMode(
            client!,
            m,
            { ledgerAccountId },
            run.idem.keyFor(`ledger|${m.code}|${m.version}|${ledgerAccountId}`),
          ),
        t('setEdit.modeSaved'),
        refresh,
      )
      .then((ok) => ok && setLinking(null));
  const toggle = (m: PayMode) =>
    void run.run(
      () =>
        saveMode(
          client!,
          m,
          { enabled: !m.enabled },
          run.idem.keyFor(`mode|${m.code}|${m.version}|${!m.enabled}`),
        ),
      t('setEdit.modeSaved'),
      refresh,
    );

  return (
    <>
      <Text style={k.sub}>{t('setEdit.modesHint')}</Text>
      {canEdit && removed.length > 0 ? (
        <Card>
          <Text style={k.name}>{t('wp16.mode.addBack')}</Text>
          <Text style={k.sub}>{t('wp16.mode.addBackHint')}</Text>
          <Chips
            label={t('wp16.mode.pick')}
            value={restore}
            options={removed.map((c): [string, string] => [c, c.replace(/_/g, ' ')])}
            onChange={setRestore}
          />
          <Button
            label={t('wp16.mode.addBack')}
            disabled={run.busy || !removed.includes(restore)}
            onPress={() =>
              void run
                .run(
                  () => restoreMode(client!, restore, run.idem.keyFor(`restore-mode|${restore}`)),
                  t('wp16.mode.addedBack'),
                  refresh,
                )
                .then((ok) => ok && setRestore(''))
            }
          />
        </Card>
      ) : null}
      {q.data.items.length === 0 ? <Text style={k.sub}>{t('setEdit.none')}</Text> : null}
      {q.data.items.map((m) => {
        const shownVpa = vpa ?? m.upiVpa ?? '';
        const vpaChanged = m.code === 'UPI' && shownVpa.trim() !== (m.upiVpa ?? '');
        const vpaBad = shownVpa.trim() !== '' && !VPA_RE.test(shownVpa.trim());
        return (
          <Card key={m.code}>
            <Text style={k.name}>{m.code}</Text>
            <Text style={k.sub}>{t(m.enabled ? 'setEdit.enabled' : 'setEdit.disabled')}</Text>
            <Text style={k.sub}>
              {t('wp16.mode.ledger')}: {ledgerLabel(m.ledgerAccountId)}
            </Text>
            {canEdit ? (
              !m.enabled && !m.ledgerAccountId ? (
                <Text style={k.sub}>{t('setEdit.needsLedger')}</Text>
              ) : (
                <Button
                  kind="ghost"
                  label={t(m.enabled ? 'setEdit.turnOff' : 'setEdit.turnOn', { code: m.code })}
                  disabled={run.busy}
                  onPress={() => toggle(m)}
                />
              )
            ) : null}
            {canEdit && ledgers.data && linking !== m.code ? (
              <Button
                kind="ghost"
                label={t('wp16.mode.linkLedger', { code: m.code })}
                onPress={() => setLinking(m.code)}
              />
            ) : null}
            {canEdit && linking === m.code && ledgers.data ? (
              <>
                <Chips
                  label={t('wp16.mode.ledger')}
                  value={m.ledgerAccountId ?? ''}
                  options={ledgers.data.map((l): [string, string] => [l.id, l.label])}
                  onChange={(id) => link(m, id)}
                />
                <Button kind="ghost" label={t('setup.cancel')} onPress={() => setLinking(null)} />
              </>
            ) : null}
            {canEdit && removing !== m.code ? (
              <Button
                kind="ghost"
                label={t('wp16.mode.delete', { code: m.code })}
                onPress={() => setRemoving(m.code)}
              />
            ) : null}
            {canEdit && removing === m.code ? (
              <>
                <Text style={k.sub}>{t('wp16.mode.deleteWhat', { code: m.code })}</Text>
                <Button
                  label={t('wp16.mode.confirmDelete')}
                  disabled={run.busy}
                  onPress={() =>
                    void run
                      .run(
                        () =>
                          deleteMode(client!, m.code, run.idem.keyFor(`delete-mode|${m.code}|${m.version}`)),
                        t('wp16.mode.deleted'),
                        refresh,
                      )
                      .then(() => setRemoving(null))
                  }
                />
                <Button kind="ghost" label={t('setup.cancel')} onPress={() => setRemoving(null)} />
              </>
            ) : null}
            {canEdit && m.code === 'UPI' ? (
              <>
                <Field
                  label={t('setEdit.upiVpa')}
                  value={shownVpa}
                  onChange={setVpa}
                  error={vpaBad ? t('setEdit.badVpa') : null}
                />
                <Button
                  label={t('setEdit.saveVpa')}
                  disabled={run.busy || !vpaChanged || vpaBad}
                  onPress={() =>
                    void run
                      .run(
                        () =>
                          saveMode(
                            client!,
                            m,
                            { upiVpa: shownVpa.trim() === '' ? null : shownVpa.trim() },
                            run.idem.keyFor(`vpa|${m.version}|${shownVpa.trim()}`),
                          ),
                        t('setEdit.modeSaved'),
                        refresh,
                      )
                      .then((ok) => ok && setVpa(null))
                  }
                />
              </>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

const sameValue = (a: SettingValue | string | boolean, b: SettingValue) =>
  (a === '' && b === null) || a === b || String(a) === String(b);

function PoliciesPanel({ canEdit, run, userId }: { canEdit: boolean; run: Run; userId: string }) {
  const { t } = useTranslation();
  const { client } = useAccess();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [method, setMethod] = useState('');
  const [effective, setEffective] = useState('');
  const q = useQuery<PolicyView>({
    queryKey: admKey(userId, 'policies-full'),
    queryFn: ({ signal }) => fetchPolicyView(client!, signal),
    retry: false,
  });
  if (q.error)
    return <PartFailed error={q.error} offline={t('setEdit.offline')} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <Text style={k.sub}>{t('common.loading')}</Text>;
  const p = q.data;
  const entries = Object.entries(p.settings);

  const bad = (key: string, type: string) => {
    const v = draft[key];
    return type === 'int' && typeof v === 'string' && !/^\d{1,10}$/.test(v.trim());
  };
  const changes: Record<string, SettingValue> = {};
  for (const [key, s] of entries) {
    const v = draft[key];
    if (v === undefined || sameValue(v, s.value)) continue;
    changes[key] =
      s.type === 'int' && typeof v === 'string'
        ? Number(v.trim())
        : s.type === 'time' && v === ''
          ? null
          : (v as SettingValue);
  }
  const anyBad = entries.some(([key, s]) => bad(key, s.type));
  const refresh = ['policies-full', 'policies'];
  const effectiveMethod = method || p.costingMethod.effective;

  return (
    <>
      {entries.map(([key, s]) => {
        const v = draft[key] ?? (s.type === 'bool' ? Boolean(s.value) : String(s.value ?? ''));
        const set = (x: string | boolean) => canEdit && setDraft((d) => ({ ...d, [key]: x }));
        return (
          <Card key={key}>
            {s.type === 'bool' ? (
              <Check label={s.description || key} value={Boolean(v)} onChange={set} />
            ) : s.type === 'enum' ? (
              <Chips
                label={s.description || key}
                value={String(v)}
                onChange={set}
                options={ENUM_VALUES.map((e): [string, string] => [e, e])}
              />
            ) : (
              <Field
                label={s.description || key}
                value={String(v)}
                onChange={set}
                keyboard={s.type === 'int' ? 'number-pad' : undefined}
                placeholder={s.type === 'time' ? 'HH:MM' : undefined}
                error={bad(key, s.type) ? t('setEdit.badValue') : null}
              />
            )}
            {!s.specifiedBySource ? <Text style={k.sub}>{t('setEdit.confirmOwner')}</Text> : null}
          </Card>
        );
      })}
      {canEdit ? (
        <Button
          label={t('setEdit.savePolicies')}
          disabled={run.busy || Object.keys(changes).length === 0 || anyBad}
          onPress={() =>
            void run
              .run(
                () =>
                  savePolicies(
                    client!,
                    { settings: changes },
                    run.idem.keyFor(`pol|${JSON.stringify(changes)}`),
                  ),
                t('setEdit.policiesSaved'),
                refresh,
              )
              .then((ok) => ok && setDraft({}))
          }
        />
      ) : null}

      <Text style={k.h2}>{t('setEdit.costing')}</Text>
      <Card>
        <Text style={k.sub}>{t('setEdit.costingNow', { value: p.costingMethod.effective })}</Text>
        {p.costingMethod.scheduled.map((c) => (
          <Text key={c.effectiveFrom} style={k.sub}>
            {t('setEdit.costingScheduled', { method: c.method, from: c.effectiveFrom })}
          </Text>
        ))}
        {canEdit ? (
          <>
            <Chips
              label={t('setEdit.costingMethod')}
              value={effectiveMethod}
              onChange={setMethod}
              options={[
                ['WEIGHTED_AVERAGE', 'WEIGHTED_AVERAGE'],
                ['FIFO', 'FIFO'],
              ]}
            />
            <Field
              label={t('setEdit.costingFrom')}
              value={effective}
              onChange={setEffective}
              placeholder="YYYY-MM-DD"
              error={effective !== '' && !validIsoDate(effective) ? t('setEdit.badDate') : null}
            />
            <Button
              label={t('setEdit.scheduleCosting')}
              disabled={run.busy || !validIsoDate(effective)}
              onPress={() =>
                void run
                  .run(
                    () =>
                      savePolicies(
                        client!,
                        { costingMethod: effectiveMethod, costingEffectiveFrom: effective },
                        run.idem.keyFor(`cost|${effectiveMethod}|${effective}`),
                      ),
                    t('setEdit.costingSaved'),
                    refresh,
                  )
                  .then((ok) => ok && setEffective(''))
              }
            />
          </>
        ) : null}
      </Card>
    </>
  );
}

/** Edit company profile, payment modes and business rules. Reading needs a permission per part; the server decides every save. */
export default function SettingsEditScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const run = useRun(userId);
  const seeCompany = can(P.company);
  const seeConfig = can(P.config);
  if (!seeCompany && !seeConfig) return <StateView state="denied" message={t('setEdit.denied')} />;
  if (client === null || userId === '') return <StateView state="loading" />;

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('setEdit.title')}</Text>
      <Text style={k.sub}>{t('setEdit.hint')}</Text>
      <Banner msg={run.msg} failure={run.failure} />
      {seeCompany ? (
        <>
          <Text style={k.h2}>{t('setEdit.companyTitle')}</Text>
          <CompanyPanel run={run} userId={userId} />
        </>
      ) : null}
      {seeConfig ? (
        <>
          <Text style={k.h2}>{t('setEdit.modesTitle')}</Text>
          <ModesPanel canEdit={can(P.paymentMode)} run={run} userId={userId} />
          <Text style={k.h2}>{t('setEdit.policiesTitle')}</Text>
          {!can(P.settings) ? <Text style={k.sub}>{t('setEdit.viewOnly')}</Text> : null}
          <PoliciesPanel canEdit={can(P.settings)} run={run} userId={userId} />
        </>
      ) : null}
      <Text style={k.sub}>{t('setEdit.notBuilt')}</Text>
    </ScrollView>
  );
}
