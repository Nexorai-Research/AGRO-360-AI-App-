import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api/errors';
import { formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { Check } from '@/ui/kit';
import { Gate, Line } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { FP, createExpense, expensePay, expenseReject, expenseReverse, expenseStep, getExpense, listAccounts, listBranches, listExpenses } from './api';
import { Ask, Button, Card, Chips, Field, Notice, Page, Picker, Result, Tap, kit, useFin, useWrite } from './kit';
import { buildExpense, cashBankAccounts, checkExpense, expenseAccounts, expenseActions, isDate, type ExpenseDraft } from './logic';

const STATUSES = ['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED', 'REVERSED'] as const;
type Mode = { m: 'list' } | { m: 'new' } | { m: 'detail'; id: string };

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { can, uid, client } = useFin();
  const w = useWrite();
  const [ask, setAsk] = useState<'reject' | 'reverse' | 'pay' | null>(null);
  const [payFrom, setPayFrom] = useState('');
  const [paidOn, setPaidOn] = useState(todayIST());
  const accts = useQuery({ queryKey: ['fin', uid, 'accounts'], queryFn: ({ signal }) => listAccounts(client!, false, signal), enabled: client !== null && ask === 'pay' });
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <ReadBox queryKey={['fin', uid, 'expense', id]} client={client} enabled load={(c, s) => getExpense(c, id, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        {(e) => {
          const a = expenseActions(e, can);
          const step = (s: 'submit' | 'approve', done: string) => void w.go(`${s}|${e.id}|${e.version}`, done, (c, k) => expenseStep(c, k, e.id, s));
          return (
            <>
              <Card>
                <Text style={kit.name}>{`${e.expenseNo} · ${e.payee}`}</Text>
                <Text style={kit.sub}>{`${shortDate(e.expenseDate)} · ${t(`fin.status.${e.status}`, { defaultValue: e.status })}`}</Text>
                <Text style={kit.sub}>{`${e.accountCode} ${e.accountName}`}</Text>
                <Line label={t('fin.expenses.amount')} value={formatINR(e.amount)} />
                <Line label={t('fin.expenses.tax')} value={formatINR(e.taxAmount)} />
                <Line label={t('fin.total')} value={formatINR(e.total)} strong />
                {e.documentNo ? <Text style={kit.sub}>{t('fin.expenses.billNo', { no: e.documentNo })}</Text> : null}
                {e.needsApproval ? <Text style={kit.sub}>{t('fin.expenses.needsApproval')}</Text> : null}
                {e.decisionNote ? <Text style={kit.sub}>{t('fin.note', { text: e.decisionNote })}</Text> : null}
                {e.reverseReason ? <Text style={kit.sub}>{t('fin.reversedBecause', { text: e.reverseReason })}</Text> : null}
              </Card>
              <Result w={w} />
              {ask === 'pay' ? (
                <Card>
                  <Gate query={accts} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
                    <Picker label={t('fin.expenses.paidFrom')} options={cashBankAccounts(accts.data?.items ?? []).map((x) => ({ id: x.id, label: `${x.code} ${x.name}` }))} value={payFrom} onChange={setPayFrom} />
                    <Field label={t('fin.expenses.paidOn')} value={paidOn} onChange={setPaidOn} placeholder="YYYY-MM-DD" />
                    <View style={kit.row}>
                      <Button
                        label={t('fin.expenses.pay')}
                        disabled={w.busy || !payFrom || !isDate(paidOn)}
                        onPress={() => void w.go(`pay|${e.id}|${payFrom}|${paidOn}`, t('fin.expenses.paid'), (c, k) => expensePay(c, k, e.id, payFrom, paidOn), () => setAsk(null))}
                      />
                      <Button kind="ghost" label={t('fin.cancel')} onPress={() => setAsk(null)} />
                    </View>
                  </Gate>
                </Card>
              ) : ask ? (
                <Ask
                  label={ask === 'reject' ? t('fin.reasonReject') : t('fin.reasonReverse')}
                  confirm={ask === 'reject' ? t('fin.reject') : t('fin.reverse')}
                  busy={w.busy}
                  onCancel={() => setAsk(null)}
                  onConfirm={(text) =>
                    void w.go(`${ask}|${e.id}|${text}`, ask === 'reject' ? t('fin.rejected') : t('fin.reversed'), (c, k) =>
                      ask === 'reject' ? expenseReject(c, k, e.id, text) : expenseReverse(c, k, e.id, text), () => setAsk(null))
                  }
                />
              ) : (
                <View style={kit.row}>
                  {a.submit ? <Button label={t('fin.submit')} disabled={w.busy} onPress={() => step('submit', t('fin.submitted'))} /> : null}
                  {a.approve ? <Button label={t('fin.approve')} disabled={w.busy} onPress={() => step('approve', t('fin.approved'))} /> : null}
                  {a.reject ? <Button kind="ghost" label={t('fin.reject')} onPress={() => setAsk('reject')} /> : null}
                  {a.pay ? <Button label={t('fin.expenses.pay')} onPress={() => setAsk('pay')} /> : null}
                  {a.reverse ? <Button kind="ghost" label={t('fin.reverse')} onPress={() => setAsk('reverse')} /> : null}
                </View>
              )}
            </>
          );
        }}
      </ReadBox>
    </>
  );
}

function NewExpense({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const w = useWrite();
  const accts = useQuery({ queryKey: ['fin', uid, 'accounts'], queryFn: ({ signal }) => listAccounts(client!, false, signal), enabled: client !== null });
  const branches = useQuery({ queryKey: ['fin', uid, 'branches'], queryFn: ({ signal }) => listBranches(client!, signal), enabled: client !== null, retry: false });
  const [d, setD] = useState<ExpenseDraft>({ date: todayIST(), accountId: '', payee: '', amount: '', tax: '', eligible: false, docNo: '', ref: '', branchId: '', notes: '' });
  const [dup, setDup] = useState(false);
  const [shown, setShown] = useState(false);
  const set = (p: Partial<ExpenseDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setDup(false);
  };
  const err = checkExpense(d);
  const created = useRef('');
  const save = (confirm: boolean) => {
    setShown(true);
    if (err) return;
    const body = buildExpense(d, confirm);
    void w.go(
      `new|${JSON.stringify(body)}`,
      t('fin.expenses.saved'),
      async (c, k) => {
        try {
          created.current = (await createExpense(c, k, body)).id;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'DUPLICATE_WARNING') setDup(true);
          throw e;
        }
      },
      () => onDone(created.current),
    );
  };
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Gate query={accts} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        <Field label={t('fin.date')} value={d.date} onChange={(v) => set({ date: v })} placeholder="YYYY-MM-DD" />
        <Picker label={t('fin.expenses.category')} options={expenseAccounts(accts.data?.items ?? []).map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))} value={d.accountId} onChange={(v) => set({ accountId: v })} />
        <Field label={t('fin.expenses.payee')} value={d.payee} onChange={(v) => set({ payee: v })} />
        <Field label={t('fin.expenses.amountBeforeTax')} value={d.amount} onChange={(v) => set({ amount: v })} keyboard="decimal-pad" />
        <Field label={t('fin.expenses.tax')} value={d.tax} onChange={(v) => set({ tax: v })} keyboard="decimal-pad" />
        <Check label={t('fin.expenses.eligible')} value={d.eligible} onChange={(v) => set({ eligible: v })} />
        <Field label={t('fin.expenses.docNo')} value={d.docNo} onChange={(v) => set({ docNo: v })} />
        <Field label={t('fin.expenses.ref')} value={d.ref} onChange={(v) => set({ ref: v })} />
        {branches.data && branches.data.items.length > 1 ? (
          <Picker label={t('fin.branch')} blank={t('fin.wholeFranchise')} options={branches.data.items.map((b) => ({ id: b.id, label: b.name }))} value={d.branchId} onChange={(v) => set({ branchId: v })} />
        ) : null}
        <Field label={t('fin.expenses.notes')} value={d.notes} onChange={(v) => set({ notes: v })} />
        {shown && err ? <Notice tone="error" text={t(`fin.expenses.err_${err}`)} /> : null}
        <Result w={w} />
        {dup ? <Notice tone="warn" text={t('fin.expenses.duplicate')} /> : null}
        <Button label={dup ? t('fin.expenses.recordAnyway') : t('fin.expenses.save')} disabled={w.busy} onPress={() => save(dup)} />
      </Gate>
    </>
  );
}

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const [mode, setMode] = useState<Mode>({ m: 'list' });
  const [status, setStatus] = useState('');
  return (
    <Page title={t('fin.expenses.title')} perm={FP.view}>
      {mode.m === 'new' ? (
        <NewExpense onBack={() => setMode({ m: 'list' })} onDone={(id) => setMode(id ? { m: 'detail', id } : { m: 'list' })} />
      ) : mode.m === 'detail' ? (
        <Detail id={mode.id} onBack={() => setMode({ m: 'list' })} />
      ) : (
        <>
          {can(FP.expCreate) ? <Button label={t('fin.expenses.new')} onPress={() => setMode({ m: 'new' })} /> : null}
          <Chips label={t('fin.statusFilter')} options={STATUSES.map((s) => ({ id: s, label: s ? t(`fin.status.${s}`) : t('fin.all') }))} value={status} onChange={setStatus} />
          <ReadBox queryKey={['fin', uid, 'expenses', status]} client={client} enabled load={(c, s) => listExpenses(c, status, s)} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
            {(d) =>
              d.items.length === 0 ? (
                <StateView state="empty" message={t('fin.expenses.empty')} />
              ) : (
                <>
                  {d.items.map((e) => (
                    <Tap key={e.id} label={e.expenseNo} onPress={() => setMode({ m: 'detail', id: e.id })}>
                      <Text style={kit.name}>{`${e.expenseNo} · ${e.payee}`}</Text>
                      <Text style={kit.sub}>{`${shortDate(e.expenseDate)} · ${e.accountCode} ${e.accountName} · ${t(`fin.status.${e.status}`, { defaultValue: e.status })}`}</Text>
                      <Line label={t('fin.total')} value={formatINR(e.total)} strong />
                    </Tap>
                  ))}
                  <Text style={kit.sub}>{t('fin.expenses.last100')}</Text>
                </>
              )
            }
          </ReadBox>
        </>
      )}
    </Page>
  );
}
