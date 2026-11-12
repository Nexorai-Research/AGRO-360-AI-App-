import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { Line } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { StateView } from '../stock/StateView';
import {
  FP, budgetReject, budgetRevise, budgetStep, budgetVariance, exceptionAck, exceptionResolve, getBudget, listBudgets, listExceptions, listPeriods, periodStep, runChecks, type Budget, type Period,
} from './api';
import { Ask, Button, Card, Chips, Page, Result, kit, useFin, useWrite } from './kit';

type Tab = 'periods' | 'budgets' | 'exceptions';

function Periods() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const w = useWrite();
  const [ask, setAsk] = useState<{ p: Period; step: 'lock' | 'unlock' } | null>(null);
  return (
    <>
      <Text style={kit.sub}>{t('fin.control.periodsNote')}</Text>
      <Result w={w} />
      <ReadBox queryKey={['fin', uid, 'periods']} client={client} enabled load={(c, s) => listPeriods(c, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        {(d) =>
          d.items.length === 0 ? (
            <StateView state="empty" message={t('fin.control.noPeriods')} />
          ) : (
            <>
              {d.items.map((y) => (
                <Card key={y.id}>
                  <Text style={kit.name}>{t('fin.control.year', { label: y.label })}</Text>
                  <Text style={kit.sub}>{`${shortDate(y.startDate)} - ${shortDate(y.endDate)} · ${t(`fin.status.${y.status}`, { defaultValue: y.status })}`}</Text>
                  {y.periods.map((p) => (
                    <View key={p.id} style={{ gap: 4 }}>
                      <Line label={`${p.label} (${t('fin.control.entries', { count: p.journals })})`} value={t(`fin.status.${p.status}`, { defaultValue: p.status })} strong={p.status === 'LOCKED'} />
                      {p.status === 'OPEN' && can(FP.periodLock) ? <Button kind="ghost" label={t('fin.control.lock', { label: p.label })} onPress={() => setAsk({ p, step: 'lock' })} /> : null}
                      {p.status === 'LOCKED' && p.canReopen && can(FP.periodReopen) ? <Button kind="ghost" label={t('fin.control.reopen', { label: p.label })} onPress={() => setAsk({ p, step: 'unlock' })} /> : null}
                      {ask?.p.id === p.id ? (
                        <Ask
                          label={t('fin.control.reasonPeriod')}
                          min={10}
                          confirm={ask.step === 'lock' ? t('fin.control.lockNow') : t('fin.control.reopenNow')}
                          busy={w.busy}
                          onCancel={() => setAsk(null)}
                          onConfirm={(text) =>
                            void w.go(`${ask.step}|${p.id}|${text}`, ask.step === 'lock' ? t('fin.control.locked') : t('fin.control.reopened'), (c, k) => periodStep(c, k, p.id, ask.step, text), () => setAsk(null))
                          }
                        />
                      ) : null}
                    </View>
                  ))}
                </Card>
              ))}
            </>
          )
        }
      </ReadBox>
    </>
  );
}

function BudgetDetail({ b }: { b: Budget }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const [mode, setMode] = useState<'lines' | 'variance'>(b.status === 'APPROVED' ? 'variance' : 'lines');
  return (
    <>
      {b.status === 'APPROVED' ? (
        <Chips label={t('fin.vouchers.show')} options={[{ id: 'lines', label: t('fin.control.lines') }, { id: 'variance', label: t('fin.control.variance') }]} value={mode} onChange={setMode} />
      ) : null}
      {mode === 'lines' ? (
        <ReadBox queryKey={['fin', uid, 'budget', b.id]} client={client} enabled load={(c, s) => getBudget(c, b.id, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
          {(x) => (
            <>
              {(x.lines ?? []).slice(0, 60).map((l, i) => (
                <Line key={i} label={`${l.accountCode} ${l.accountName} ${l.month.slice(0, 7)}`} value={formatINR(l.amount)} />
              ))}
              {(x.lines ?? []).length > 60 ? <Text style={kit.sub}>{t('fin.control.firstLines', { count: (x.lines ?? []).length })}</Text> : null}
            </>
          )}
        </ReadBox>
      ) : (
        <ReadBox queryKey={['fin', uid, 'variance', b.fyLabel]} client={client} enabled load={(c, s) => budgetVariance(c, b.fyLabel, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
          {(v) => (
            <>
              <Text style={kit.sub}>{t('fin.control.varianceNote', { from: shortDate(v.from), to: shortDate(v.to) })}</Text>
              {v.rows.map((r) => (
                <Card key={r.code}>
                  <Text style={kit.name}>{`${r.code} ${r.name}`}</Text>
                  <Line label={t('fin.control.budget')} value={formatINR(r.budget)} />
                  <Line label={t('fin.control.actual')} value={formatINR(r.actual)} />
                  <Line label={t('fin.control.varianceLine')} value={formatINR(r.variance)} strong />
                </Card>
              ))}
            </>
          )}
        </ReadBox>
      )}
    </>
  );
}

function Budgets() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const w = useWrite();
  const [open, setOpen] = useState('');
  const [rejecting, setRejecting] = useState('');
  return (
    <>
      <Result w={w} />
      <ReadBox queryKey={['fin', uid, 'budgets']} client={client} enabled load={(c, s) => listBudgets(c, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        {(d) =>
          d.items.length === 0 ? (
            <StateView state="empty" message={t('fin.control.noBudgets')} />
          ) : (
            <>
              {d.items.map((b) => (
                <Card key={b.id}>
                  <Text style={kit.name}>{`${b.name} · ${b.fyLabel} v${b.version}`}</Text>
                  <Text style={kit.sub}>{t(`fin.status.${b.status}`, { defaultValue: b.status })}</Text>
                  <Line label={t('fin.control.lineCount', { count: b.lineCount })} value={formatINR(b.total)} strong />
                  <View style={kit.row}>
                    <Button kind="ghost" label={open === b.id ? t('fin.close') : t('fin.control.view', { name: b.name })} onPress={() => setOpen(open === b.id ? '' : b.id)} />
                    {b.status === 'DRAFT' && can(FP.budgetManage) ? <Button label={t('fin.submit')} disabled={w.busy} onPress={() => void w.go(`submit|${b.id}|${b.version}`, t('fin.submitted'), (c, k) => budgetStep(c, k, b.id, 'submit'))} /> : null}
                    {b.status === 'PENDING_APPROVAL' && can(FP.budgetApprove) ? <Button label={t('fin.approve')} disabled={w.busy} onPress={() => void w.go(`approve|${b.id}|${b.version}`, t('fin.approved'), (c, k) => budgetStep(c, k, b.id, 'approve'))} /> : null}
                    {b.status === 'PENDING_APPROVAL' && can(FP.budgetApprove) ? <Button kind="ghost" label={t('fin.reject')} onPress={() => setRejecting(b.id)} /> : null}
                    {b.status === 'APPROVED' && can(FP.budgetManage) ? <Button kind="ghost" label={t('fin.control.newVersion')} disabled={w.busy} onPress={() => void w.go(`revise|${b.fyLabel}|${b.version}`, t('fin.control.revised'), (c, k) => budgetRevise(c, k, b.fyLabel))} /> : null}
                  </View>
                  {rejecting === b.id ? (
                    <Ask label={t('fin.reasonReject')} confirm={t('fin.reject')} busy={w.busy} onCancel={() => setRejecting('')}
                      onConfirm={(text) => void w.go(`reject|${b.id}|${text}`, t('fin.rejected'), (c, k) => budgetReject(c, k, b.id, text), () => setRejecting(''))} />
                  ) : null}
                  {open === b.id ? <BudgetDetail b={b} /> : null}
                </Card>
              ))}
            </>
          )
        }
      </ReadBox>
    </>
  );
}

function Exceptions() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const w = useWrite();
  const [status, setStatus] = useState('OPEN');
  const [resolving, setResolving] = useState('');
  const manage = can(FP.exception);
  return (
    <>
      <Chips label={t('fin.statusFilter')} options={['OPEN', 'ACKNOWLEDGED', 'RESOLVED', ''].map((s) => ({ id: s, label: s ? t(`fin.status.${s}`) : t('fin.all') }))} value={status} onChange={setStatus} />
      {manage ? <Button label={t('fin.control.runChecks')} disabled={w.busy} onPress={() => void w.go('run', t('fin.control.checksDone'), (c, k) => runChecks(c, k))} /> : null}
      <Result w={w} />
      <ReadBox queryKey={['fin', uid, 'exceptions', status]} client={client} enabled load={(c, s) => listExceptions(c, status, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        {(d) =>
          d.items.length === 0 ? (
            <StateView state="empty" message={t('fin.control.noExceptions')} />
          ) : (
            <>
              {d.items.map((x) => (
                <Card key={x.id}>
                  <Text style={kit.name}>{`${x.exceptionNo} · ${x.title}`}</Text>
                  <Text style={kit.sub}>{`${x.severity} · ${t(`fin.status.${x.status}`, { defaultValue: x.status })} · ${shortDate(x.raisedAt)}`}</Text>
                  {x.resolution ? <Text style={kit.sub}>{t('fin.control.resolution', { text: x.resolution })}</Text> : null}
                  {manage && x.status !== 'RESOLVED' ? (
                    <View style={kit.row}>
                      {x.status === 'OPEN' ? <Button kind="ghost" label={t('fin.control.ack', { no: x.exceptionNo })} disabled={w.busy} onPress={() => void w.go(`ack|${x.id}`, t('fin.control.acked'), (c, k) => exceptionAck(c, k, x.id))} /> : null}
                      <Button kind="ghost" label={t('fin.control.resolve', { no: x.exceptionNo })} onPress={() => setResolving(x.id)} />
                    </View>
                  ) : null}
                  {resolving === x.id ? (
                    <Ask label={t('fin.control.resolutionLabel')} confirm={t('fin.control.resolveNow')} busy={w.busy} onCancel={() => setResolving('')}
                      onConfirm={(text) => void w.go(`res|${x.id}|${text}`, t('fin.control.resolved'), (c, k) => exceptionResolve(c, k, x.id, text), () => setResolving(''))} />
                  ) : null}
                </Card>
              ))}
            </>
          )
        }
      </ReadBox>
    </>
  );
}

export default function ControlScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('periods');
  return (
    <Page title={t('fin.control.title')} perm={FP.view}>
      <Chips
        label={t('fin.vouchers.show')}
        options={[{ id: 'periods', label: t('fin.control.tabPeriods') }, { id: 'budgets', label: t('fin.control.tabBudgets') }, { id: 'exceptions', label: t('fin.control.tabExceptions') }] as { id: Tab; label: string }[]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'periods' ? <Periods /> : tab === 'budgets' ? <Budgets /> : <Exceptions />}
    </Page>
  );
}
