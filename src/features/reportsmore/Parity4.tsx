import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Check } from '@/ui/kit';
import { Card, Chips, Field, Line, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';

// Web parity, phase 4 (apps/web/src/pages/reports.js seasonalTab, builder / customTab, branchDashTab;
// modules/reporting/src/application/{seasons,views}.ts).

const useCtx = () => {
  const { me, client } = useAuth();
  return { client, userId: me?.userId ?? '', ready: client !== null && me !== null };
};

// ---- 4.2 season months ------------------------------------------------------------------------------------------------------
export interface Season {
  code: string;
  name: string;
  startMonth: number;
  endMonth: number;
}
export const seasonsText = (list: Season[]) =>
  list.map((s) => `${s.code}, ${s.name}, ${s.startMonth}, ${s.endMonth}`).join('\n');
/** "CODE, Name, first month, last month" per line, like the web; returns the first bad line. */
export function parseSeasonLines(text: string): { seasons: Season[] } | { badLine: number } {
  const out: Season[] = [];
  const seen = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const [i, l] of lines.entries()) {
    const [code, name, a, b] = l.split(',').map((x) => x.trim());
    const s = {
      code: (code ?? '').toUpperCase(),
      name: name ?? '',
      startMonth: Number(a),
      endMonth: Number(b),
    };
    const month = (m: number) => Number.isInteger(m) && m >= 1 && m <= 12;
    if (
      !/^[A-Z][A-Z0-9_]{0,19}$/.test(s.code) ||
      s.name.length < 2 ||
      s.name.length > 40 ||
      !month(s.startMonth) ||
      !month(s.endMonth) ||
      seen.has(s.code)
    )
      return { badLine: i + 1 };
    seen.add(s.code);
    out.push(s);
  }
  if (out.length === 0) return { badLine: 1 };
  return { seasons: out };
}

export function SeasonsCard() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, userId, ready } = useCtx();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [text, setText] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['stf', userId, 'more', 'season-settings'],
    queryFn: ({ signal }) =>
      client!.get<{ seasons: Season[]; version: number }>('/reports/seasons', { signal }),
    enabled: ready && can('reports.financial'),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!can('reports.financial') || !q.data || !Array.isArray(q.data.seasons)) return null;
  const s = q.data;
  const parsed = text === null ? null : parseSeasonLines(text);
  return (
    <Card>
      <Text style={kit.name}>{t('wp4.seasons.title')}</Text>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {text === null ? (
        <>
          {s.seasons.map((x) => (
            <Line key={x.code} label={`${x.code} ${x.name}`} value={`${x.startMonth} - ${x.endMonth}`} />
          ))}
          <Button
            kind="ghost"
            label={t('wp4.seasons.change')}
            onPress={() => (act.clear(), keys.reset(), setText(seasonsText(s.seasons)))}
          />
        </>
      ) : (
        <>
          <Text style={kit.sub}>{t('wp4.seasons.hint')}</Text>
          <Field label={t('wp4.seasons.lines')} value={text} onChange={setText} />
          {parsed && 'badLine' in parsed ? (
            <Notice tone="error" text={t('wp4.seasons.badLine', { n: parsed.badLine })} />
          ) : null}
          <Button
            label={t('wp4.seasons.save')}
            disabled={act.busy || !parsed || 'badLine' in parsed}
            onPress={() => {
              if (!parsed || !('seasons' in parsed)) return;
              const body = { seasons: parsed.seasons };
              void act.run(
                () =>
                  client!.put('/reports/seasons', {
                    body,
                    version: s.version,
                    idempotencyKey: keys.keyFor(`${s.version}|${JSON.stringify(body)}`),
                  }),
                t('wp4.seasons.saved'),
                () => (setText(null), void qc.invalidateQueries({ queryKey: ['stf', userId, 'more'] })),
              );
            }}
          />
          <Button kind="ghost" label={t('wp4.cancel')} onPress={() => setText(null)} />
        </>
      )}
    </Card>
  );
}

// ---- 4.1 branch dashboard ---------------------------------------------------------------------------------------------------
interface BranchDash {
  branch: { id: string; name: string };
  date: string;
  asOf: string;
  tiles: { id: string; label: string; value: string | null; unit: 'money' | 'count' | 'percent' }[];
  salesByHour: { hour: number; bills: number; total: string }[];
  topProducts: { label: string; quantity: string; netSales: string }[];
  notes?: string[];
}
const tileValue = (x: BranchDash['tiles'][number]) =>
  x.value === null
    ? '-'
    : x.unit === 'money'
      ? formatINR(x.value)
      : x.unit === 'percent'
        ? `${x.value}%`
        : x.value;

export function BranchDashboard() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, userId, ready } = useCtx();
  const [branchId, setBranchId] = useState('');
  const bq = useQuery({
    queryKey: ['stf', userId, 'more', 'dash-branches'],
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: { id: string; name: string; status?: string }[] }>('/branches', { signal })
      ).items.filter((b) => b.status === undefined || b.status === 'ACTIVE'),
    enabled: ready && can('reports.sales'),
    staleTime: 10 * 60_000,
  });
  const branches = bq.data ?? [];
  const id = branchId || branches[0]?.id || '';
  const q = useQuery({
    queryKey: ['stf', userId, 'more', 'branch-dash', id],
    queryFn: ({ signal }) =>
      client!.get<BranchDash>('/reports/dashboard/branch', { query: { branchId: id }, signal }),
    enabled: ready && can('reports.sales') && id !== '',
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!can('reports.sales') || branches.length === 0) return null;
  const d = q.data;
  return (
    <Card>
      <Text style={kit.name}>{t('wp4.branch.title')}</Text>
      {branches.length > 1 ? (
        <Chips
          label={t('wp4.branch.which')}
          options={branches.map((b) => ({ id: b.id, label: b.name }))}
          value={id}
          onChange={setBranchId}
        />
      ) : null}
      {q.isError ? <Notice tone="error" text={t('wp4.branch.failed')} /> : null}
      {d && Array.isArray(d.tiles) ? (
        <>
          <Text style={kit.sub}>{t('wp4.branch.asOf', { name: d.branch.name, date: d.date })}</Text>
          {d.tiles.map((x) => (
            <Line key={x.id} label={x.label} value={tileValue(x)} />
          ))}
          {d.salesByHour.some((x) => x.bills > 0) ? (
            <Text style={kit.name}>{t('wp4.branch.byHour')}</Text>
          ) : null}
          {d.salesByHour
            .filter((x) => x.bills > 0)
            .map((x) => (
              <Line key={x.hour} label={`${String(x.hour).padStart(2, '0')}:00`} value={formatINR(x.total)} />
            ))}
          {d.topProducts.length ? <Text style={kit.name}>{t('wp4.branch.top')}</Text> : null}
          {d.topProducts.map((x) => (
            <Line key={x.label} label={`${x.label} × ${x.quantity}`} value={formatINR(x.netSales)} />
          ))}
          {(d.notes ?? []).map((n, i) => (
            <Text key={i} style={kit.sub}>
              {n}
            </Text>
          ))}
        </>
      ) : null}
    </Card>
  );
}

// ---- 4.3 / 4.4 custom report builder, change and delete ----------------------------------------------------------------------
export interface Dataset {
  id: string;
  label: string;
  fields: { key: string; label: string }[];
  measures: string[];
}
export interface ViewFull {
  id: string;
  name: string;
  dataset: string;
  mine?: boolean;
  version?: number;
  sharedRoles?: string[];
  definition?: {
    dataset: string;
    columns: string[];
    groupBy?: string[];
    filters?: { field: string; op: string; value: string | number }[];
    limit?: number;
  };
}
export const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
export interface ViewForm {
  name: string;
  dataset: string;
  columns: string[];
  groupBy: string[];
  filterField: string;
  filterOp: string;
  filterValue: string;
  limit: string;
  shared: string;
}
export type ViewError = 'name' | 'columns' | 'limit' | 'shared';
export function viewErrors(f: ViewForm): ViewError[] {
  const e: ViewError[] = [];
  if (f.name.trim().length < 2 || f.name.trim().length > 80) e.push('name');
  if (f.columns.length === 0) e.push('columns');
  if (f.limit.trim() !== '' && !/^[1-9]\d{0,4}$/.test(f.limit.trim())) e.push('limit');
  const roles = f.shared
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (roles.length > 20 || roles.some((r) => !/^[a-z][a-z0-9_]{1,40}$/.test(r))) e.push('shared');
  return e;
}
/** Same definition as the web builder: a filter only with a value; a number unless the value is not one or the condition is "contains". */
export function viewBody(f: ViewForm) {
  const v = f.filterValue.trim();
  const filters =
    v && f.filterField
      ? [
          {
            field: f.filterField,
            op: f.filterOp,
            value: isNaN(Number(v)) || f.filterOp === 'contains' ? v : Number(v),
          },
        ]
      : [];
  return {
    name: f.name.trim(),
    definition: {
      dataset: f.dataset,
      columns: f.columns,
      ...(f.groupBy.length ? { groupBy: f.groupBy } : {}),
      ...(filters.length ? { filters } : {}),
      limit: Number(f.limit) || 500,
    },
    sharedRoles: f.shared
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  };
}
export const viewToForm = (v: ViewFull | null, firstDataset: string): ViewForm => {
  const fl = v?.definition?.filters?.[0];
  return {
    name: v?.name ?? '',
    dataset: v?.definition?.dataset ?? firstDataset,
    columns: v?.definition?.columns ?? [],
    groupBy: v?.definition?.groupBy ?? [],
    filterField: fl?.field ?? '',
    filterOp: fl?.op ?? 'eq',
    filterValue: fl ? String(fl.value) : '',
    limit: String(v?.definition?.limit ?? 500),
    shared: (v?.sharedRoles ?? []).join(', '),
  };
};

export function ViewBuilder({ view, onDone }: { view: ViewFull | null; onDone: () => void }) {
  const { t } = useTranslation();
  const { client, userId, ready } = useCtx();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<ViewForm | null>(null);
  const [tried, setTried] = useState(false);
  const ds = useQuery({
    queryKey: ['stf', userId, 'more', 'datasets'],
    queryFn: ({ signal }) => client!.get<{ datasets: Dataset[] }>('/reports/custom/datasets', { signal }),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const list = ds.data?.datasets ?? [];
  if (ds.isError) return <Notice tone="error" text={t('wp4.views.noDatasets')} />;
  if (list.length === 0) return null;
  const form = f ?? viewToForm(view, list[0]!.id);
  const d = list.find((x) => x.id === form.dataset) ?? list[0]!;
  const set = (p: Partial<ViewForm>) => setF({ ...form, ...p });
  const toggle = (k: 'columns' | 'groupBy', key: string) =>
    set({ [k]: form[k].includes(key) ? form[k].filter((x) => x !== key) : [...form[k], key] });
  const errs = viewErrors(form);
  const bad = (e: ViewError) => (tried && errs.includes(e) ? t(`wp4.views.v.${e}`) : null);
  return (
    <Card>
      <Text style={kit.name}>{view ? t('wp4.views.changeTitle') : t('wp4.views.newTitle')}</Text>
      <Text style={kit.sub}>{t('wp4.views.intro')}</Text>
      <Field
        label={t('wp4.views.name')}
        value={form.name}
        onChange={(v) => set({ name: v })}
        error={bad('name')}
      />
      <Chips
        label={t('wp4.views.data')}
        options={list.map((x) => ({ id: x.id, label: x.label }))}
        value={form.dataset}
        onChange={(v) => set({ dataset: v, columns: [], groupBy: [], filterField: '' })}
      />
      <Text style={kit.sub}>{t('wp4.views.columns')}</Text>
      <View style={kit.row}>
        {d.fields.map((x) => (
          <Check
            key={x.key}
            label={x.label}
            value={form.columns.includes(x.key)}
            onChange={() => toggle('columns', x.key)}
          />
        ))}
      </View>
      {bad('columns') ? <Notice tone="error" text={bad('columns')!} /> : null}
      <Text style={kit.sub}>{t('wp4.views.groupBy')}</Text>
      <View style={kit.row}>
        {d.fields
          .filter((x) => !d.measures.includes(x.key))
          .map((x) => (
            <Check
              key={x.key}
              label={`${t('wp4.views.by')} ${x.label}`}
              value={form.groupBy.includes(x.key)}
              onChange={() => toggle('groupBy', x.key)}
            />
          ))}
      </View>
      <Chips
        label={t('wp4.views.filterField')}
        options={[
          { id: '', label: t('wp4.views.noFilter') },
          ...d.fields.map((x) => ({ id: x.key, label: x.label })),
        ]}
        value={form.filterField}
        onChange={(v) => set({ filterField: v })}
      />
      {form.filterField ? (
        <>
          <Chips
            label={t('wp4.views.condition')}
            options={OPS.map((o) => ({ id: o, label: t(`wp4.views.op.${o}`) }))}
            value={form.filterOp}
            onChange={(v) => set({ filterOp: v })}
          />
          <Field
            label={t('wp4.views.value')}
            value={form.filterValue}
            onChange={(v) => set({ filterValue: v })}
          />
        </>
      ) : null}
      <Field
        label={t('wp4.views.limit')}
        value={form.limit}
        onChange={(v) => set({ limit: v })}
        keyboard="numeric"
        error={bad('limit')}
      />
      <Field
        label={t('wp4.views.shared')}
        value={form.shared}
        onChange={(v) => set({ shared: v })}
        error={bad('shared')}
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button
        label={t('wp4.views.save')}
        disabled={act.busy}
        onPress={() => {
          setTried(true);
          if (viewErrors(form).length > 0) return;
          const body = viewBody(form);
          const k = keys.keyFor(`${view?.id ?? 'new'}|${view?.version ?? ''}|${JSON.stringify(body)}`);
          void act.run(
            () =>
              view
                ? client!.patch(`/reports/views/${encodeURIComponent(view.id)}`, {
                    body,
                    version: view.version,
                    idempotencyKey: k,
                  })
                : client!.post('/reports/views', { body, idempotencyKey: k }),
            t('wp4.views.saved'),
            () => (void qc.invalidateQueries({ queryKey: ['stf', userId, 'more'] }), onDone()),
          );
        }}
      />
      <Button kind="ghost" label={t('wp4.cancel')} onPress={onDone} />
    </Card>
  );
}

/** Change and delete for a report the person owns; a shared one is only run. */
export function ViewManage({ view }: { view: ViewFull }) {
  const { t } = useTranslation();
  const { client, userId } = useCtx();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  if (view.mine === false) return <Text style={kit.sub}>{t('wp4.views.shared_')}</Text>;
  return (
    <>
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {mode === null ? (
        <View style={kit.row}>
          <Button
            kind="ghost"
            label={`${t('wp4.views.change')} ${view.name}`}
            onPress={() => setMode('edit')}
          />
          <Button
            kind="ghost"
            label={`${t('wp4.views.delete')} ${view.name}`}
            onPress={() => (keys.reset(), setMode('delete'))}
          />
        </View>
      ) : null}
      {mode === 'edit' ? <ViewBuilder view={view} onDone={() => setMode(null)} /> : null}
      {mode === 'delete' ? (
        <Card>
          <Text style={kit.sub}>{t('wp4.views.deleteSure', { name: view.name })}</Text>
          <Button
            label={t('wp4.views.deleteNow')}
            disabled={act.busy}
            onPress={() =>
              void act.run(
                () =>
                  client!.delete(`/reports/views/${encodeURIComponent(view.id)}`, {
                    idempotencyKey: keys.keyFor(`del|${view.id}`),
                  }),
                t('wp4.views.deleted'),
                () => (setMode(null), void qc.invalidateQueries({ queryKey: ['stf', userId, 'more'] })),
              )
            }
          />
          <Button kind="ghost" label={t('wp4.cancel')} onPress={() => setMode(null)} />
        </Card>
      ) : null}
    </>
  );
}
