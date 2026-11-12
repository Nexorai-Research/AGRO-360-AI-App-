import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { formatINR } from '@/money';
import { StateView } from '../stock/StateView';
import { useAction } from '../hr/kit';
import { searchCustomers } from './api';
import {
  CRMPERM,
  changeMembers,
  commitImport,
  createGroup,
  createSegment,
  fetchBranches,
  fetchCohorts,
  fetchDuplicates,
  fetchGroup,
  fetchGroups,
  fetchImportJobs,
  fetchImportTemplate,
  fetchMerges,
  fetchSegments,
  mergeCustomers,
  previewSegment,
  undoMerge,
  uploadImport,
  type DupGroup,
  type ImportPreview,
} from './crm-admin-api';
import { SEGMENT_FIELDS, buildRule, retentionPct, validDate } from './crm-logic';
import { DoButton, FormCard, Panel, Reveal, Row, Tabs, cut, s, useCrm } from './crm-kit';
import { fmtDate } from './ui';

type Tab = 'duplicates' | 'segments' | 'retention' | 'groups' | 'import';
const GROUP_KINDS = ['FARMER_GROUP', 'FPO', 'SHG', 'COOPERATIVE', 'OTHER'] as const;

export default function ToolsScreen() {
  const { t } = useTranslation();
  const { can } = useCrm();
  const tabs: { id: Tab; label: string; ok: boolean }[] = [
    { id: 'duplicates', label: t('cus.tools.tabDuplicates'), ok: can(CRMPERM.merge) || can(CRMPERM.view) },
    { id: 'segments', label: t('cus.tools.tabSegments'), ok: can(CRMPERM.segment) },
    { id: 'retention', label: t('cus.tools.tabRetention'), ok: can(CRMPERM.segment) },
    { id: 'groups', label: t('cus.tools.tabGroups'), ok: can(CRMPERM.view) },
    { id: 'import', label: t('cus.tools.tabImport'), ok: can(CRMPERM.import) },
  ];
  const shown = tabs.filter((x) => x.ok);
  const [tab, setTab] = useState<Tab>(shown[0]?.id ?? 'duplicates');
  if (shown.length === 0) return <StateView state="denied" message={t('cus.denied')} />;
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('cus.tools.title') }} />
      <Text style={kit.title}>{t('cus.tools.title')}</Text>
      <Text style={kit.sub}>{t('cus.tools.intro')}</Text>
      <Tabs value={tab} onChange={setTab} tabs={shown} />
      {tab === 'duplicates' ? (
        <DuplicatesTab />
      ) : tab === 'segments' ? (
        <SegmentsTab />
      ) : tab === 'retention' ? (
        <RetentionTab />
      ) : tab === 'groups' ? (
        <GroupsTab />
      ) : (
        <ImportTab />
      )}
    </ScrollView>
  );
}

// ---- duplicates and merge ---------------------------------------------------------------------------------
function DuplicatesTab() {
  const { t } = useTranslation();
  const { can } = useCrm();
  const merge = can(CRMPERM.merge);
  return (
    <Panel name={['duplicates']} load={fetchDuplicates}>
      {(groups) => {
        const { shown, more } = cut(groups, 30);
        return (
          <View style={{ gap: 10 }}>
            <Text style={s.h}>{t('cus.tools.possibleDuplicates')}</Text>
            {groups.length === 0 ? <StateView state="empty" message={t('cus.tools.noDuplicates')} /> : null}
            {shown.map((g, i) => (
              <DupCard key={g.customers.map((c) => c.id).join('-') || i} g={g} merge={merge} />
            ))}
            {more > 0 ? <Text style={kit.sub}>{t('cus.more', { count: more })}</Text> : null}
            {merge ? <MergeHistory /> : null}
          </View>
        );
      }}
    </Panel>
  );
}

function DupCard({ g, merge }: { g: DupGroup; merge: boolean }) {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const [keep, setKeep] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const keys = useActionKey();
  const act = useAction(keys);
  const go = () => {
    const other = g.customers.find((c) => c.id !== keep);
    if (!keep || !other) return setErr(t('cus.tools.pickKeep'));
    if (reason.trim().length < 3) return setErr(t('cus.v.reason'));
    setErr(null);
    const body = { survivorId: keep, mergedId: other.id, reason: reason.trim() };
    void act.run(
      () => mergeCustomers(client!, body, keys.keyFor(JSON.stringify(body))),
      t('cus.tools.merged'),
      reload,
    );
  };
  return (
    <Card>
      {g.customers.map((c) => (
        <Text key={c.id} style={s.name}>
          {c.code} {c.name} {c.mobile ?? ''}
        </Text>
      ))}
      <Text style={s.sub}>
        {t('cus.tools.why', { reason: g.reason ?? t('cus.tools.similar'), pct: Math.round(g.score * 100) })}
      </Text>
      {merge ? (
        <Reveal label={t('cus.tools.merge')}>
          <Card>
            <Text style={s.sub}>{t('cus.tools.mergeNote')}</Text>
            <Chips
              label={t('cus.tools.keep')}
              value={keep}
              onChange={(v) => {
                setKeep(v);
                act.clear();
              }}
              options={g.customers.map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
            />
            <Field
              label={t('cus.tools.reason')}
              value={reason}
              onChange={(v) => {
                setReason(v);
                act.clear();
              }}
              error={err}
            />
            {act.failure ? <Notice tone="error" text={act.failure} /> : null}
            {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
            <Button
              label={act.busy ? t('common.loading') : t('cus.tools.merge')}
              disabled={act.busy}
              onPress={go}
            />
          </Card>
        </Reveal>
      ) : null}
    </Card>
  );
}

function MergeHistory() {
  const { t } = useTranslation();
  const { client } = useCrm();
  return (
    <Panel name={['merges']} load={fetchMerges}>
      {(rows) => (
        <View style={{ gap: 8 }}>
          <Text style={s.h}>{t('cus.tools.history')}</Text>
          {rows.length === 0 ? <StateView state="empty" message={t('cus.tools.noMerges')} /> : null}
          {rows.slice(0, 30).map((m) => (
            <Card key={m.id}>
              <Row
                title={t('cus.tools.mergedLine', { kept: m.survivorCode, merged: m.mergedCode })}
                lines={[
                  fmtDate(m.mergedAt.slice(0, 10)),
                  m.status === 'MERGED' ? t('cus.tools.statusMerged') : t('cus.tools.statusUndone'),
                ]}
              />
              {m.status === 'MERGED' ? (
                <DoButton
                  label={t('cus.tools.undo')}
                  confirm={t('cus.tools.undoWarn')}
                  fp={`undo|${m.id}`}
                  run={(key) => undoMerge(client!, m.id, key)}
                  doneText={t('cus.tools.undone')}
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Panel>
  );
}

// ---- segments and retention ---------------------------------------------------------------------------------
function SegmentsTab() {
  const { t } = useTranslation();
  const { client } = useCrm();
  const [field, setField] = useState('crop');
  const [op, setOp] = useState('eq');
  const fieldNames = Object.keys(SEGMENT_FIELDS);
  const def = SEGMENT_FIELDS[field]!;
  const hint = (f: string) => t(`cus.tools.hint.${SEGMENT_FIELDS[f]!.type}`);
  return (
    <Panel name={['segments']} load={fetchSegments}>
      {(rows) => (
        <View style={{ gap: 10 }}>
          <Reveal label={t('cus.tools.newSegment')}>
            <Card>
              <Text style={s.sub}>{t('cus.tools.segmentNote')}</Text>
              <Chips
                label={t('cus.tools.ruleField')}
                value={field}
                onChange={(f) => {
                  setField(f);
                  setOp(SEGMENT_FIELDS[f]!.ops[0]!);
                }}
                options={fieldNames.map((f) => ({ id: f, label: t(`cus.tools.field.${f}`) }))}
              />
              <Chips
                label={t('cus.tools.ruleOp')}
                value={op}
                onChange={setOp}
                options={def.ops.map((o) => ({ id: o, label: t(`cus.tools.op.${o}`) }))}
              />
              <FormCard
                key={`${field}-${op}`}
                fields={[
                  { name: 'name', label: t('cus.tools.segmentName') },
                  { name: 'value', label: `${t('cus.tools.ruleValue')} (${hint(field)})` },
                ]}
                submitLabel={t('cus.save')}
                validate={(v) => {
                  const e: Record<string, string> = {};
                  if (v.name!.trim().length < 2 || v.name!.trim().length > 80) e.name = 'text2';
                  if ('error' in buildRule(field, op, v.value!)) e.value = 'ruleValue';
                  return e;
                }}
                run={(v, key) => {
                  const r = buildRule(field, op, v.value!);
                  if ('error' in r) throw new Error(r.error);
                  return createSegment(client!, { name: v.name!.trim(), rules: [r.rule] }, key);
                }}
                doneText={t('cus.saved')}
              />
            </Card>
          </Reveal>
          {rows.length === 0 ? <StateView state="empty" message={t('cus.tools.noSegments')} /> : null}
          {rows.slice(0, 50).map((sg) => (
            <SegmentCard key={sg.id} sg={sg} client={client} />
          ))}
        </View>
      )}
    </Panel>
  );
}

function SegmentCard({
  sg,
  client,
}: {
  sg: { id: string; name: string; status: string; rules: { field: string; op: string; value: unknown }[] };
  client: ReturnType<typeof useCrm>['client'];
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const run = async () => {
    setBad(null);
    try {
      const p = await previewSegment(client!, sg.id);
      setCount(
        p.belowMinimumCohort
          ? t('cus.tools.tooFew', { count: p.count })
          : t('cus.tools.customersCount', { count: p.count }),
      );
    } catch (e) {
      setBad(e instanceof Error ? e.message : 'error');
    }
  };
  return (
    <Card>
      <Row
        title={sg.name}
        lines={[
          sg.rules
            .map(
              (r) =>
                `${t(`cus.tools.field.${r.field}`, { defaultValue: r.field })} ${t(`cus.tools.op.${r.op}`, { defaultValue: r.op })} ${Array.isArray(r.value) ? r.value.join(', ') : String(r.value)}`,
            )
            .join(' / '),
          sg.status === 'ACTIVE' ? t('cus.active') : t('cus.inactive'),
        ]}
      />
      {count ? <Notice tone="ok" text={count} /> : null}
      {bad ? (
        <Notice tone="error" text={t('errors.generic', { code: 'PREVIEW', correlationId: '-' })} />
      ) : null}
      <Button kind="ghost" label={t('cus.tools.preview')} onPress={() => void run()} />
    </Card>
  );
}

function RetentionTab() {
  const { t } = useTranslation();
  return (
    <Panel name={['cohorts']} load={(c, signal) => fetchCohorts(c, 6, signal)}>
      {(r) => (
        <View style={{ gap: 8 }}>
          <Text style={kit.sub}>{t('cus.tools.retentionNote', { min: r.minimumCohort })}</Text>
          {r.items.length === 0 ? <StateView state="empty" message={t('cus.tools.noCohorts')} /> : null}
          {r.items.map((c) => (
            <Card key={c.cohort}>
              <Row
                title={t('cus.tools.firstBought', { month: c.cohort })}
                lines={
                  c.hidden || !c.size
                    ? [t('cus.tools.tooFewToShow')]
                    : [
                        t('cus.tools.cohortSize', { count: c.size }),
                        c.counts
                          .slice(1)
                          .map((_, k) => `+${k + 1}: ${retentionPct(c.counts, k + 1, c.size!)}%`)
                          .join('   '),
                      ]
                }
              />
            </Card>
          ))}
        </View>
      )}
    </Panel>
  );
}

// ---- groups -------------------------------------------------------------------------------------------------
/** Search by name or mobile and pick one customer. */
function CustomerPick({
  label,
  onPick,
}: {
  label: string;
  onPick: (c: { id: string; name: string; code: string }) => void;
}) {
  const { t } = useTranslation();
  const { client } = useCrm();
  const [q, setQ] = useState('');
  const text = q.trim();
  const res = useQuery({
    queryKey: ['cus', 'pick', text],
    enabled: client !== null && text.length >= 2,
    queryFn: ({ signal }) => searchCustomers(client!, { q: text, limit: 8, signal }),
  });
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} value={q} onChange={setQ} />
      {res.isError ? <Notice tone="error" text={t('cus.tools.searchFailed')} /> : null}
      {(res.data ?? []).map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`${c.name} ${c.code}`}
          onPress={() => {
            onPick(c);
            setQ('');
          }}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={s.name}>
            {c.name} · {c.code}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function GroupsTab() {
  const { t } = useTranslation();
  const { client, can } = useCrm();
  const manage = can(CRMPERM.group);
  const [leader, setLeader] = useState<{ id: string; name: string } | null>(null);
  return (
    <Panel name={['groups']} load={fetchGroups}>
      {(rows) => (
        <View style={{ gap: 10 }}>
          {manage ? (
            <Reveal label={t('cus.tools.newGroup')}>
              <Card>
                <CustomerPick label={t('cus.tools.leader')} onPick={setLeader} />
                <Text style={s.sub}>
                  {leader ? t('cus.tools.leaderIs', { name: leader.name }) : t('cus.tools.leaderNone')}
                </Text>
                <FormCard
                  fields={[
                    { name: 'name', label: t('cus.tools.groupName') },
                    {
                      name: 'kind',
                      label: t('cus.tools.groupKind'),
                      choices: GROUP_KINDS.map((k) => ({ id: k, label: t(`cus.tools.kind.${k}`) })),
                    },
                  ]}
                  submitLabel={t('cus.save')}
                  validate={(v) => {
                    const e: Record<string, string> = {};
                    if (v.name!.trim().length < 2 || v.name!.trim().length > 120) e.name = 'text2';
                    if (!v.kind) e.kind = 'pick';
                    if (!leader) e.name = e.name || 'leader';
                    return e;
                  }}
                  run={(v, key) =>
                    createGroup(
                      client!,
                      { name: v.name!.trim(), kind: v.kind!, leaderCustomerId: leader!.id },
                      key,
                    )
                  }
                  doneText={t('cus.saved')}
                  onDone={() => setLeader(null)}
                />
              </Card>
            </Reveal>
          ) : null}
          {rows.length === 0 ? <StateView state="empty" message={t('cus.tools.noGroups')} /> : null}
          {rows.slice(0, 50).map((g) => (
            <Card key={g.id}>
              <Row
                title={`${g.code} ${g.name}`}
                lines={[
                  t(`cus.tools.kind.${g.kind}`, { defaultValue: g.kind }),
                  t('cus.tools.members', { count: g.memberCount }),
                  g.status === 'ACTIVE' ? t('cus.active') : t('cus.inactive'),
                ]}
              />
              {manage && g.status === 'ACTIVE' ? (
                <Reveal label={t('cus.tools.manageMembers')}>
                  <GroupMembers id={g.id} />
                </Reveal>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Panel>
  );
}

function GroupMembers({ id }: { id: string }) {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const keys = useActionKey();
  const act = useAction(keys);
  const change = (add: string[], remove: string[]) =>
    void act.run(
      () =>
        changeMembers(client!, id, add, remove, keys.keyFor(`${id}|${add.join(',')}|${remove.join(',')}`)),
      t('cus.saved'),
      reload,
    );
  return (
    <Panel name={['group', id]} load={(c, signal) => fetchGroup(c, id, signal)}>
      {(g) => (
        <Card>
          {g.members.map((m) => (
            <View key={m.customerId} style={{ gap: 4 }}>
              <Text style={s.name}>
                {m.name} ({t(`cus.tools.role.${m.role}`, { defaultValue: m.role.toLowerCase() })})
              </Text>
              {m.role !== 'LEADER' ? (
                <Button
                  kind="ghost"
                  label={`${t('cus.tools.remove')} ${m.name}`}
                  disabled={act.busy}
                  onPress={() => change([], [m.customerId])}
                />
              ) : null}
            </View>
          ))}
          <CustomerPick
            label={t('cus.tools.addMember')}
            onPick={(c) => !g.members.some((m) => m.customerId === c.id) && change([c.id], [])}
          />
          {act.failure ? <Notice tone="error" text={act.failure} /> : null}
          {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        </Card>
      )}
    </Panel>
  );
}

// ---- customer import ----------------------------------------------------------------------------------------
function ImportTab() {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const [csv, setCsv] = useState('');
  const [branch, setBranch] = useState('');
  const [asOn, setAsOn] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [tpl, setTpl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const upKeys = useActionKey();
  const up = useAction(upKeys);
  const cmKeys = useActionKey();
  const cm = useAction(cmKeys);
  const check = () => {
    if (!csv.trim() || !branch) return setErr(t('cus.tools.importNeed'));
    if (asOn.trim() && !validDate(asOn)) return setErr(t('cus.v.date'));
    setErr(null);
    setDone(null);
    const body = {
      csv,
      branchId: branch,
      filename: 'phone-import.csv',
      ...(asOn.trim() ? { asOnDate: asOn.trim() } : {}),
    };
    void up.run(
      async () => setPreview(await uploadImport(client!, body, upKeys.keyFor(JSON.stringify(body)))),
      t('cus.tools.checked'),
    );
  };
  const confirm = () =>
    void cm.run(
      async () => {
        const r = await commitImport(client!, preview!.jobId, cmKeys.keyFor(preview!.jobId));
        setDone(t('cus.tools.importDone', { created: r.result.created, skipped: r.result.skipped }));
        setPreview(null);
        setCsv('');
      },
      t('cus.saved'),
      reload,
    );
  return (
    <View style={{ gap: 10 }}>
      <Card>
        <Text style={s.sub}>{t('cus.tools.importNote')}</Text>
        <Button
          kind="ghost"
          label={t('cus.tools.showTemplate')}
          onPress={() => {
            fetchImportTemplate(client!).then(
              (x) => setTpl(x),
              () => setTpl(t('cus.tools.searchFailed')),
            );
          }}
        />
        {tpl ? (
          <Text selectable style={s.sub}>
            {tpl.split('\n').slice(0, 3).join('\n')}
          </Text>
        ) : null}
        <Panel name={['branches']} load={fetchBranches}>
          {(bs) => (
            <Chips
              label={t('cus.tools.importBranch')}
              value={branch}
              onChange={setBranch}
              options={bs.map((b) => ({ id: b.id, label: b.name }))}
            />
          )}
        </Panel>
        <Field label={t('cus.tools.asOn')} value={asOn} onChange={setAsOn} placeholder="YYYY-MM-DD" />
        <TextInput
          value={csv}
          onChangeText={(x) => {
            setCsv(x);
            setPreview(null);
            up.clear();
          }}
          accessibilityLabel={t('cus.tools.csv')}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, { minHeight: 140, textAlignVertical: 'top', paddingTop: 10 }]}
        />
        {err ? <Notice tone="error" text={err} /> : null}
        {up.failure ? <Notice tone="error" text={up.failure} /> : null}
        <Button
          label={up.busy ? t('common.loading') : t('cus.tools.checkFile')}
          disabled={up.busy}
          onPress={check}
        />
      </Card>
      {preview ? (
        <Card>
          <Text style={s.h}>{t('cus.tools.previewTitle', { rows: preview.totalRows })}</Text>
          <Text style={s.sub}>
            {t('cus.tools.previewLine', {
              valid: preview.validRows,
              dup: preview.duplicateRows,
              bad: preview.errorRows,
              dues: formatINR(preview.openingTotal),
            })}
          </Text>
          {preview.errors.slice(0, 5).map((e, i) => (
            <Text key={i} style={s.err}>
              {t('cus.tools.rowProblem', { row: e.row, column: e.column, message: e.message })}
            </Text>
          ))}
          {cm.failure ? <Notice tone="error" text={cm.failure} /> : null}
          <Button
            label={preview.errorRows ? t('cus.tools.importValid') : t('cus.tools.import')}
            disabled={cm.busy || preview.validRows === 0}
            onPress={confirm}
          />
        </Card>
      ) : null}
      {done ? <Notice tone="ok" text={done} /> : null}
      <Panel name={['importJobs']} load={fetchImportJobs}>
        {(jobs) => (
          <View style={{ gap: 8 }}>
            <Text style={s.h}>{t('cus.tools.importHistory')}</Text>
            {jobs.length === 0 ? <StateView state="empty" message={t('cus.tools.noImports')} /> : null}
            {jobs.slice(0, 20).map((j) => (
              <Card key={j.id}>
                <Row
                  title={j.filename ?? '-'}
                  lines={[
                    fmtDate(j.createdAt.slice(0, 10)),
                    t('cus.tools.jobLine', { rows: j.totalRows, created: j.result?.created ?? '-' }),
                    j.status,
                  ]}
                />
              </Card>
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}
