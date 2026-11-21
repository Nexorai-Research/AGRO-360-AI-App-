import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR, sub, sum, isZero, cmp } from '@/money';
import { Button } from '@/ui/Button';
import { ConfirmBox } from '@/ui/ConfirmBox';
import { todayIST } from '../collections/receipt';
import { isDate } from '../hr/logic';
import { StateView } from '../stock/StateView';
import { useFailureText } from '../hr/kit';
import {
  PAY_MODES,
  P,
  fetchBankFile,
  fetchBranches,
  fetchRun,
  fetchRuns,
  stfKey,
  type RunDetail,
  type Run,
  type Slip,
} from './api';
import {
  Banner,
  Card,
  Chips,
  Field,
  Gate,
  Line,
  MonthPicker,
  Notice,
  Screen,
  isMoney,
  isNetwork,
  isSignedMoney,
  kit,
  shareText,
  useCan,
  useWrite,
} from './ui';

type Write = ReturnType<typeof useWrite>;
const dueOf = (s: Slip) => sub(s.net, s.paidAmount);

/** The cards over the list, like the web: a reversed run is not counted in what was paid. Money is added as decimals. */
export function payrollSummary(rows: Run[]) {
  const live = rows.filter((r) => r.status !== 'REVERSED');
  return {
    runs: rows.length,
    employees: live.reduce((n, r) => n + Number(r.employeeCount ?? 0), 0),
    gross: sum(live.map((r) => r.grossTotal ?? '0')),
    net: sum(live.map((r) => r.netTotal ?? '0')),
    drafts: rows.filter((r) => r.status === 'DRAFT').length,
    toReview: live.reduce((n, r) => n + (r.exceptions?.length ?? 0), 0),
  };
}
/** The search (run number, month or status), the status filter, the month filter and the branch filter of the web. */
export function filterRuns(
  rows: Run[],
  f: { q: string; status: string; month: string; branch: string },
): Run[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.status || r.status === f.status) &&
      (!f.month || r.period === f.month) &&
      (!f.branch || r.branchId === f.branch) &&
      (!needle || `${r.runNo} ${r.period} ${r.status}`.toLowerCase().includes(needle)),
  );
}
export const RUN_STATUSES = ['', 'DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'REVERSED'] as const;
/** A month is typed as YYYY-MM; an empty one means every month. */
export const monthOk = (v: string) => v.trim() === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim());

export default function PayrollScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(P.prepare) || can(P.approve) || can(P.pay);
  const ready = client !== null && me !== null && allowed;
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [period, setPeriod] = useState(todayIST().slice(0, 7));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [branch, setBranch] = useState('');
  const [edit, setEdit] = useState<{ id: string; period: string } | null>(null);
  const [del, setDel] = useState<Run | null>(null);
  const w = useWrite();
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId, 'runs'] });

  const runs = useQuery({
    queryKey: stfKey(userId, 'runs'),
    queryFn: ({ signal }) => fetchRuns(client!, signal),
    enabled: ready && openId === null,
    retry,
  });

  const branches = useQuery({
    queryKey: stfKey(userId, 'branches'),
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: ready && openId === null,
    retry,
  });
  const all = runs.data?.items ?? [];
  const shown = filterRuns(all, { q, status, month: month.trim(), branch });
  const sumOf = payrollSummary(all);

  if (openId) {
    return (
      <Screen title={t('stf.pay.title')}>
        <RunView
          id={openId}
          w={w}
          onBack={() => {
            w.clear();
            w.newAction();
            setOpenId(null);
            refresh();
          }}
        />
      </Screen>
    );
  }
  return (
    <Screen title={t('stf.pay.title')}>
      <Gate query={runs} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        <Banner w={w} />
        {can(P.prepare) ? (
          creating ? (
            <Card>
              <Text style={kit.name}>{t('stf.pay.newRun')}</Text>
              <MonthPicker value={period} onChange={setPeriod} />
              <Button
                label={t('stf.pay.create')}
                disabled={w.busy}
                onPress={() =>
                  void w.send<Run>('POST', '/hr/payroll-runs', { period }, t('stf.pay.created'), (r) => {
                    setCreating(false);
                    refresh();
                    if (r?.id) setOpenId(r.id);
                  })
                }
              />
              <Button kind="ghost" label={t('stf.cancel')} onPress={() => setCreating(false)} />
            </Card>
          ) : (
            <Button
              label={t('stf.pay.newRun')}
              onPress={() => (w.clear(), w.newAction(), setCreating(true))}
            />
          )
        ) : null}
        {all.length > 0 ? (
          <Card>
            <Line label={t('wp38.runs')} value={String(sumOf.runs)} />
            <Line label={t('wp38.paid')} value={String(sumOf.employees)} />
            <Line label={t('stf.pay.gross')} value={formatINR(sumOf.gross)} />
            <Line label={t('stf.pay.net')} value={formatINR(sumOf.net)} strong />
            <Line label={t('wp38.drafts')} value={String(sumOf.drafts)} />
            <Line label={t('wp38.review')} value={String(sumOf.toReview)} />
          </Card>
        ) : null}
        <Field label={t('wp38.search')} value={q} onChange={setQ} />
        <Chips
          label={t('stf.emp.status')}
          options={RUN_STATUSES.map((x) => ({
            id: x,
            label: x === '' ? t('stf.all') : t(`stf.pay.st_${x}`),
          }))}
          value={status}
          onChange={setStatus}
        />
        <Field
          label={t('wp38.month')}
          value={month}
          onChange={setMonth}
          placeholder="YYYY-MM"
          error={monthOk(month) ? null : t('wp38.badMonth')}
        />
        {(branches.data ?? []).length > 1 ? (
          <Chips
            label={t('stf.emp.branch')}
            options={[
              { id: '', label: t('stf.all') },
              ...(branches.data ?? []).map((b) => ({ id: b.id, label: b.name })),
            ]}
            value={branch}
            onChange={setBranch}
          />
        ) : null}
        {edit ? (
          <Card>
            <Text style={kit.name}>{t('wp38.editTitle')}</Text>
            <Text style={kit.sub}>{t('wp38.editNote')}</Text>
            <MonthPicker value={edit.period} onChange={(p) => setEdit({ ...edit, period: p })} />
            <Button
              label={t('wp38.save')}
              disabled={w.busy}
              onPress={() =>
                void w.send(
                  'PATCH',
                  `/hr/payroll-runs/${edit.id}`,
                  { period: edit.period },
                  t('wp38.updated'),
                  () => (setEdit(null), refresh()),
                )
              }
            />
            <Button kind="ghost" label={t('stf.cancel')} onPress={() => setEdit(null)} />
          </Card>
        ) : null}
        {del ? (
          <Card>
            <ConfirmBox
              title={t('wp38.deleteTitle', { no: del.runNo })}
              text={t('wp38.deleteAsk', { period: del.period })}
              confirm={t('wp38.delete')}
              cancel={t('stf.cancel')}
              busy={w.busy}
              onConfirm={() =>
                void w.send(
                  'DELETE',
                  `/hr/payroll-runs/${del.id}`,
                  undefined,
                  t('wp38.deleted'),
                  () => (setDel(null), refresh()),
                )
              }
              onCancel={() => setDel(null)}
            />
          </Card>
        ) : null}
        {all.length === 0 ? <StateView state="empty" message={t('stf.pay.empty')} /> : null}
        {all.length > 0 && shown.length === 0 ? (
          <StateView state="empty" message={t('wp38.noMatch')} />
        ) : null}
        {shown.map((r) => (
          <Card key={r.id}>
            <Text style={kit.name}>
              {r.period} · {r.runNo}
            </Text>
            <Text style={kit.sub}>{t(`stf.pay.st_${r.status}`, { defaultValue: r.status })}</Text>
            <Line label={t('stf.pay.employees')} value={String(r.employeeCount)} />
            <Line label={t('stf.pay.gross')} value={formatINR(r.grossTotal)} />
            <Line label={t('stf.pay.net')} value={formatINR(r.netTotal)} strong />
            {r.exceptions.length > 0 ? (
              <Text style={kit.sub}>{t('stf.pay.toReview', { count: r.exceptions.length })}</Text>
            ) : null}
            <Button kind="ghost" label={t('stf.open')} onPress={() => (w.clear(), setOpenId(r.id))} />
            {can(P.prepare) ? (
              <>
                <Button
                  kind="ghost"
                  label={t('wp38.edit', { no: r.runNo })}
                  disabled={r.status !== 'DRAFT'}
                  onPress={() => (
                    w.clear(),
                    w.newAction(),
                    setDel(null),
                    setEdit({ id: r.id, period: r.period })
                  )}
                />
                <Button
                  kind="ghost"
                  label={t('wp38.deleteRun', { no: r.runNo })}
                  disabled={r.status !== 'DRAFT'}
                  onPress={() => (w.clear(), w.newAction(), setEdit(null), setDel(r))}
                />
                {r.status !== 'DRAFT' ? <Text style={kit.sub}>{t('wp38.onlyDraft')}</Text> : null}
              </>
            ) : null}
          </Card>
        ))}
      </Gate>
    </Screen>
  );
}

function RunView({ id, w, onBack }: { id: string; w: Write; onBack: () => void }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const failText = useFailureText();
  const userId = me?.userId ?? '';
  const [ask, setAsk] = useState<null | 'reopen' | 'reverse'>(null);
  const [reason, setReason] = useState('');
  const [slip, setSlip] = useState<{ s: Slip; kind: 'adjust' | 'pay' } | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  const run = useQuery({
    queryKey: stfKey(userId, 'run', id),
    queryFn: ({ signal }) => fetchRun(client!, id, signal),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const reload = () => {
    void qc.invalidateQueries({ queryKey: ['stf', userId, 'run'] });
    void qc.invalidateQueries({ queryKey: ['stf', userId, 'runs'] });
  };
  const r: RunDetail | undefined = run.data;
  const post = (action: string, body: unknown, done: string, after?: () => void) =>
    w.send('POST', `/hr/payroll-runs/${id}/${action}`, body, done, () => {
      reload();
      after?.();
    });

  const bank = async () => {
    setFileMsg(null);
    setFileErr(null);
    try {
      const f = await fetchBankFile(client!, id);
      setFileMsg(
        (await shareText(f.fileName, f.csv ?? f.content ?? '')) ? t('stf.shared') : t('stf.shareFailed'),
      );
    } catch (e) {
      setFileErr(failText(e));
    }
  };

  const editable = r && (r.status === 'DRAFT' || r.status === 'CALCULATED') && can(P.prepare);
  const payable = r && (r.status === 'APPROVED' || r.status === 'PAID') && can(P.pay);

  return (
    <Gate query={run} denied={false} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
      <Banner w={w} />
      {fileMsg ? <Notice tone="ok" text={fileMsg} /> : null}
      {fileErr ? <Notice tone="error" text={fileErr} /> : null}
      {r ? (
        <>
          <Card>
            <Text style={kit.name}>
              {r.period} · {r.runNo} · {t(`stf.pay.st_${r.status}`, { defaultValue: r.status })}
            </Text>
            <Line label={t('stf.pay.gross')} value={formatINR(r.grossTotal)} />
            <Line label={t('stf.pay.deductions')} value={formatINR(r.deductionTotal)} />
            <Line label={t('stf.pay.advances')} value={formatINR(r.advanceTotal)} />
            <Line label={t('stf.pay.incentives')} value={formatINR(r.incentiveTotal)} />
            <Line label={t('stf.pay.net')} value={formatINR(r.netTotal)} strong />
          </Card>
          {r.exceptions.length > 0 ? (
            <Card>
              <Text style={kit.name}>{t('stf.pay.review')}</Text>
              {r.exceptions.map((e, i) => (
                <Text key={`${e.code}-${i}`} style={kit.sub}>
                  {e.employeeCode ? `${e.employeeCode}: ` : ''}
                  {e.message}
                </Text>
              ))}
            </Card>
          ) : (
            <Text style={kit.sub}>{t('stf.pay.noExceptions')}</Text>
          )}

          {editable ? (
            <Button
              label={t('stf.pay.calculate')}
              disabled={w.busy}
              onPress={() => void post('calculate', undefined, t('stf.pay.calculated'))}
            />
          ) : null}
          {can(P.approve) && r.status === 'CALCULATED' ? (
            <Button
              label={t('stf.pay.approve')}
              disabled={w.busy}
              onPress={() => void post('approve', undefined, t('stf.pay.approved'))}
            />
          ) : null}
          {can(P.prepare) && r.status === 'CALCULATED' ? (
            <Button
              kind="ghost"
              label={t('stf.pay.reopen')}
              onPress={() => (setAsk('reopen'), setReason(''))}
            />
          ) : null}
          {payable ? (
            <Button
              kind="ghost"
              label={t('stf.pay.publish')}
              disabled={w.busy}
              onPress={() => void post('publish', undefined, t('stf.pay.published'))}
            />
          ) : null}
          {payable ? <Button kind="ghost" label={t('stf.pay.bankFile')} onPress={() => void bank()} /> : null}
          {can(P.approve) && (r.status === 'APPROVED' || r.status === 'PAID') ? (
            <Button
              kind="ghost"
              label={t('stf.pay.reverse')}
              onPress={() => (setAsk('reverse'), setReason(''))}
            />
          ) : null}

          {ask ? (
            <Card>
              <Text style={kit.name}>{t(ask === 'reopen' ? 'stf.pay.reopen' : 'stf.pay.reverse')}</Text>
              <Field
                label={t('stf.reason')}
                value={reason}
                onChange={setReason}
                error={reason !== '' && reason.trim().length < 3 ? t('stf.reasonShort') : null}
              />
              <Button
                label={t('stf.confirm')}
                disabled={w.busy || reason.trim().length < 3}
                onPress={() =>
                  void post(
                    ask,
                    { reason: reason.trim() },
                    t(ask === 'reopen' ? 'stf.pay.reopened' : 'stf.pay.reversed'),
                    () => setAsk(null),
                  )
                }
              />
              <Button kind="ghost" label={t('stf.cancel')} onPress={() => setAsk(null)} />
            </Card>
          ) : null}

          {slip ? (
            slip.kind === 'adjust' ? (
              <AdjustForm
                runId={id}
                s={slip.s}
                w={w}
                onDone={() => (setSlip(null), reload())}
                onCancel={() => setSlip(null)}
              />
            ) : (
              <PayForm
                s={slip.s}
                w={w}
                onDone={() => (setSlip(null), reload())}
                onCancel={() => setSlip(null)}
              />
            )
          ) : null}

          {(r.slips ?? []).length === 0 ? <StateView state="empty" message={t('stf.pay.noSlips')} /> : null}
          {(r.slips ?? []).map((s) => (
            <Card key={s.id}>
              <Text style={kit.name}>
                {s.employeeCode} · {s.employeeName}
              </Text>
              <Line label={t('stf.pay.paidDays')} value={s.paidDays} />
              <Line label={t('stf.pay.gross')} value={formatINR(s.gross)} />
              <Line label={t('stf.pay.deductions')} value={formatINR(s.totalDeductions)} />
              {!isZero(s.advanceRecovery) ? (
                <Line label={t('stf.pay.advanceRecovery')} value={formatINR(s.advanceRecovery)} />
              ) : null}
              {!isZero(s.incentive) ? (
                <Line label={t('stf.pay.incentives')} value={formatINR(s.incentive)} />
              ) : null}
              {!isZero(s.adjustment) ? (
                <Line label={t('stf.pay.adjustment')} value={formatINR(s.adjustment)} />
              ) : null}
              <Line label={t('stf.pay.net')} value={formatINR(s.net)} strong />
              <Line label={t('stf.pay.paid')} value={formatINR(s.paidAmount)} />
              {s.warnings.map((x) => (
                <Text key={x.code} style={kit.sub}>
                  {x.message}
                </Text>
              ))}
              {editable ? (
                <Button
                  kind="ghost"
                  label={t('stf.pay.adjust')}
                  onPress={() => (w.clear(), setSlip({ s, kind: 'adjust' }))}
                />
              ) : null}
              {payable && cmp(dueOf(s), '0') > 0 ? (
                <Button
                  kind="ghost"
                  label={t('stf.pay.pay')}
                  onPress={() => (w.clear(), setSlip({ s, kind: 'pay' }))}
                />
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
      <Button kind="ghost" label={t('stf.back')} onPress={onBack} />
    </Gate>
  );
}

function AdjustForm({
  runId,
  s,
  w,
  onDone,
  onCancel,
}: {
  runId: string;
  s: Slip;
  w: Write;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(s.adjustment);
  const [reason, setReason] = useState('');
  const valid = isSignedMoney(amount) && reason.trim().length >= 3;
  return (
    <Card>
      <Text style={kit.name}>{t('stf.pay.adjustTitle', { name: s.employeeName })}</Text>
      <Text style={kit.sub}>{t('stf.pay.adjustNote')}</Text>
      <Field
        label={t('stf.pay.adjustAmount')}
        value={amount}
        onChange={setAmount}
        keyboard="numbers-and-punctuation"
        error={amount !== '' && !isSignedMoney(amount) ? t('stf.badAmount') : null}
      />
      <Field
        label={t('stf.reason')}
        value={reason}
        onChange={setReason}
        error={reason !== '' && reason.trim().length < 3 ? t('stf.reasonShort') : null}
      />
      <Button
        label={t('stf.save')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            `/hr/payroll-runs/${runId}/payslips/${s.id}/adjust`,
            { adjustment: amount.trim(), reason: reason.trim() },
            t('stf.pay.adjusted'),
            onDone,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}

function PayForm({
  s,
  w,
  onDone,
  onCancel,
}: {
  s: Slip;
  w: Write;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const due = dueOf(s);
  const [amount, setAmount] = useState(due);
  const [mode, setMode] = useState<(typeof PAY_MODES)[number]>('BANK_TRANSFER');
  const [paidOn, setPaidOn] = useState(todayIST());
  const [ref, setRef] = useState('');
  const over = isMoney(amount) && cmp(amount.trim(), due) > 0;
  const valid = isMoney(amount) && !over && isDate(paidOn);
  return (
    <Card>
      <Text style={kit.name}>{t('stf.pay.payTitle', { name: s.employeeName })}</Text>
      <Text style={kit.sub}>{t('stf.pay.payNote', { due: formatINR(due) })}</Text>
      <Field
        label={t('stf.amount')}
        value={amount}
        onChange={setAmount}
        keyboard="decimal-pad"
        error={amount !== '' && !isMoney(amount) ? t('stf.badAmount') : over ? t('stf.pay.overDue') : null}
      />
      <Chips
        label={t('stf.pay.mode')}
        options={PAY_MODES.map((m) => ({ id: m, label: t(`stf.pay.mode_${m}`) }))}
        value={mode}
        onChange={setMode}
      />
      <Field
        label={t('stf.date')}
        value={paidOn}
        onChange={setPaidOn}
        placeholder="YYYY-MM-DD"
        error={!isDate(paidOn) ? t('stf.badDate') : null}
      />
      <Field label={t('stf.pay.reference')} value={ref} onChange={setRef} />
      <Button
        label={t('stf.pay.record')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            `/hr/payslips/${s.id}/payments`,
            {
              amount: amount.trim(),
              mode,
              paidOn: paidOn.trim(),
              ...(ref.trim() ? { reference: ref.trim() } : {}),
            },
            t('stf.pay.recorded'),
            onDone,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}
