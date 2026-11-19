import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { monthRange, previousMonth } from '../accounts/compliance-api';
import { shortDate } from '../hr/logic';
import {
  Card,
  Chips,
  Field,
  Gate,
  Line,
  Notice,
  isNetwork,
  kit,
  useAction,
  useActionKey,
  useCan,
} from '../hr/kit';
import {
  fetchRows,
  formErrors,
  humanise,
  initialValues,
  pick,
  runRowAction,
  type Col,
  type Row,
  type RowAction,
  type TabDef,
  type Values,
} from './cmp-api';
import { CreateForms, FormFields, TraceView } from './CmpForm';
import { HUBS } from './cmp-tabs';
import { ComplianceSettingsCard } from './SettingsCard';
import { TaxTabForm } from './TaxForms';
import { DetailButton } from '../accounts/Parity11';

const MIN_REASON = 3;

function show(t: TFunction, row: Row, c: Col): string {
  const v = pick(row, c.k);
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ');
  if (typeof v === 'object') return '';
  if (c.kind === 'bool') return t(v ? 'cmp.yes' : 'cmp.no');
  const s = String(v);
  if (c.kind === 'money') return formatINR(s);
  if (c.kind === 'date') return shortDate(s);
  if (c.kind === 'status') return t(`cmp.v.${s}`, { defaultValue: humanise(s) });
  return s;
}
const label = (t: TFunction, k: string) => t(`cmp.f.${k.replace(/\./g, '_')}`);

export default function HubScreen({ hub }: { hub: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const def = HUBS[hub]!;
  const tabs = def.tabs.filter((d) => can(d.perm));
  const [tabId, setTabId] = useState(tabs[0]?.id ?? '');
  const tab: TabDef | undefined = tabs.find((d) => d.id === tabId) ?? tabs[0];
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const [pending, setPending] = useState<{ row: Row; action: RowAction } | null>(null);
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<Values>({});
  const [tried, setTried] = useState(false);
  const keys = useActionKey();
  const act = useAction(keys);

  const thisMonth = todayIST().slice(0, 7);
  const period = which === 'this' ? thisMonth : previousMonth(thisMonth);
  const range = monthRange(period);
  const ready = client !== null && me !== null && tab !== undefined;

  const q = useQuery({
    queryKey: ['cmp', userId, hub, tab?.id, period],
    queryFn: ({ signal }) => fetchRows(client!, tab!, period, range, signal),
    enabled: ready && !tab?.view,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  const send = (a: RowAction, row: Row) => {
    if (a.fields) {
      setTried(true);
      if (formErrors(a.fields, values, can).length > 0) return Promise.resolve();
    }
    const fp = `${a.path(row)}|${reason.trim()}|${JSON.stringify(values)}`;
    return act.run(
      () => runRowAction(client!, a, row, reason, keys.keyFor(fp), values),
      t('cmp.done'),
      () => {
        setPending(null);
        setReason('');
        setValues({});
        setTried(false);
        void qc.invalidateQueries({ queryKey: ['cmp', userId] });
      },
    );
  };
  const start = (a: RowAction, row: Row) => {
    act.clear();
    keys.reset();
    setReason('');
    setTried(false);
    setValues(a.fields ? initialValues(a.fields, todayIST()) : {});
    if (a.reason || a.confirm || a.fields) setPending({ row, action: a });
    else void send(a, row);
  };

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t(`cmp.hub.${def.titleKey}`)}
      </Text>
      <Text style={kit.sub}>{t('cmp.serverFigures')}</Text>
      {hub === 'taxRecords' ? <ComplianceSettingsCard /> : null}
      {tabs.length > 0 && tab ? (
        <>
          <Chips
            label={t('cmp.which')}
            options={tabs.map((d) => ({ id: d.id, label: t(`cmp.tab.${d.id}`) }))}
            value={tab.id}
            onChange={(id) => {
              setTabId(id);
              setPending(null);
              act.clear();
            }}
          />
          {tab.query === 'period' || tab.query === 'range' ? (
            <Chips
              label={t('cmp.month')}
              options={[
                { id: 'this', label: t('cmp.thisMonth', { month: thisMonth }) },
                { id: 'last', label: t('cmp.lastMonth', { month: previousMonth(thisMonth) }) },
              ]}
              value={which}
              onChange={setWhich}
            />
          ) : null}
          {hub === 'taxRecords' ? (
            <TaxTabForm tab={tab.id} period={period} range={range} today={todayIST()} />
          ) : null}
          {tab.create ? <CreateForms key={tab.id} defs={tab.create} today={todayIST()} /> : null}
        </>
      ) : null}
      {tab?.view === 'trace' ? <TraceView /> : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {tab?.view ? null : (
        <Gate
          query={q}
          denied={tabs.length === 0}
          deniedText={t('cmp.denied')}
          offlineText={t('cmp.offline')}
        >
          {q.data?.total !== null && q.data?.total !== undefined ? (
            <Card>
              <Line label={t('cmp.total')} value={formatINR(q.data.total)} strong />
            </Card>
          ) : null}
          {q.data && q.data.rows.length === 0 ? (
            <StateView
              state="empty"
              message={t(`cmp.empty.${tab?.id}`, { defaultValue: t('cmp.empty.any') })}
            />
          ) : null}
          {q.data?.rows.map((row, i) => {
            const rowActions = (tab?.actions ?? []).filter((a) => can(a.perm) && (!a.show || a.show(row)));
            const name = tab!.title
              .map((c) => show(t, row, c))
              .filter(Boolean)
              .join(' · ');
            return (
              <Card key={String(row.id ?? i)}>
                <Text style={kit.name}>{name || '-'}</Text>
                {tab!.fields.map((c) => {
                  const v = show(t, row, c);
                  return v ? <Line key={c.k} label={label(t, c.k)} value={v} /> : null;
                })}
                {tab?.detail ? (
                  <DetailButton
                    label={t('wp11.open')}
                    path={tab.detail.path(row)}
                    pick={tab.detail.pick ? (x) => x[tab.detail!.pick!] : undefined}
                  />
                ) : null}
                {rowActions.map((a) => (
                  <Button
                    key={a.id}
                    kind="ghost"
                    label={t(`cmp.act.${a.id}`)}
                    disabled={act.busy}
                    onPress={() => start(a, row)}
                  />
                ))}
                {pending && pending.row === row ? (
                  <>
                    <Text style={kit.sub}>{t(`cmp.ask.${pending.action.id}`)}</Text>
                    {pending.action.reason ? (
                      <Field label={t('cmp.reason')} value={reason} onChange={setReason} />
                    ) : null}
                    {pending.action.fields ? (
                      <FormFields
                        fields={pending.action.fields}
                        v={values}
                        set={(key, x) => setValues({ ...values, [key]: x })}
                        bad={tried ? formErrors(pending.action.fields, values, can) : []}
                      />
                    ) : null}
                    <Button
                      label={t('cmp.confirm')}
                      disabled={
                        act.busy || (pending.action.reason === true && reason.trim().length < MIN_REASON)
                      }
                      onPress={() => void send(pending.action, row)}
                    />
                    <Button kind="ghost" label={t('cmp.cancel')} onPress={() => setPending(null)} />
                  </>
                ) : null}
              </Card>
            );
          })}
        </Gate>
      )}
    </ScrollView>
  );
}
