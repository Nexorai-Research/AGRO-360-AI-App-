import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { Gate, Line } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import {
  FP,
  createVoucher,
  getJournal,
  getVoucher,
  listAccounts,
  listBranches,
  listJournals,
  listVouchers,
  voucherReject,
  voucherReverse,
  voucherStep,
  type VoucherKind,
} from './api';
import {
  Ask,
  Button,
  Card,
  Chips,
  Field,
  Notice,
  Page,
  Picker,
  Result,
  Tap,
  kit,
  useFin,
  useWrite,
} from './kit';
import {
  buildVoucher,
  cashBankAccounts,
  checkVoucher,
  emptyLine,
  journalDiff,
  postableAccounts,
  voucherActions,
  type DraftLine,
  type VoucherDraft,
} from './logic';

const KINDS: VoucherKind[] = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'];
const STATUSES = ['', 'DRAFT', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED'] as const;
type View2 = { mode: 'list' } | { mode: 'new' } | { mode: 'detail'; id: string };

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { can, uid, client } = useFin();
  const w = useWrite();
  const [ask, setAsk] = useState<'reject' | 'reverse' | null>(null);
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <ReadBox
        queryKey={['fin', uid, 'voucher', id]}
        client={client}
        enabled
        load={(c, s) => getVoucher(c, id, s)}
        deniedText={t('fin.denied')}
        offlineText={t('fin.offline')}
      >
        {(v) => {
          const a = voucherActions(v, can);
          const step = (s: 'post' | 'submit' | 'approve' | 'cancel', done: string) =>
            void w.go(`${s}|${v.id}|${v.version}`, done, (c, k) => voucherStep(c, k, v.id, s));
          return (
            <>
              <Card>
                <Text style={kit.name}>{v.voucherNo}</Text>
                <Text
                  style={kit.sub}
                >{`${t(`fin.vouchers.kind_${v.kind}`, { defaultValue: v.kind })} · ${shortDate(v.voucherDate)} · ${t(`fin.status.${v.status}`, { defaultValue: v.status })}`}</Text>
                <Text style={kit.sub}>{v.narration}</Text>
                <Line label={t('fin.total')} value={formatINR(v.total)} strong />
                {v.decisionNote ? (
                  <Text style={kit.sub}>{t('fin.note', { text: v.decisionNote })}</Text>
                ) : null}
                {v.reverseReason ? (
                  <Text style={kit.sub}>{t('fin.reversedBecause', { text: v.reverseReason })}</Text>
                ) : null}
              </Card>
              {(v.lines ?? []).map((l) => (
                <Card key={l.lineNo}>
                  <Text style={kit.name}>{`${l.accountCode} ${l.accountName}`}</Text>
                  <Line label={t('fin.debit')} value={formatINR(l.debit)} />
                  <Line label={t('fin.credit')} value={formatINR(l.credit)} />
                </Card>
              ))}
              {v.needsApproval && v.status === 'DRAFT' ? (
                <Notice tone="warn" text={t('fin.vouchers.needsApproval')} />
              ) : null}
              <Result w={w} />
              {ask ? (
                <Ask
                  label={ask === 'reject' ? t('fin.reasonReject') : t('fin.reasonReverse')}
                  confirm={ask === 'reject' ? t('fin.reject') : t('fin.reverse')}
                  busy={w.busy}
                  onCancel={() => setAsk(null)}
                  onConfirm={(text) =>
                    void w.go(
                      `${ask}|${v.id}|${text}`,
                      ask === 'reject' ? t('fin.rejected') : t('fin.reversed'),
                      (c, k) =>
                        ask === 'reject' ? voucherReject(c, k, v.id, text) : voucherReverse(c, k, v.id, text),
                      () => setAsk(null),
                    )
                  }
                />
              ) : (
                <View style={kit.row}>
                  {a.post ? (
                    <Button
                      label={t('fin.post')}
                      disabled={w.busy}
                      onPress={() => step('post', t('fin.posted'))}
                    />
                  ) : null}
                  {a.submit ? (
                    <Button
                      label={t('fin.submit')}
                      disabled={w.busy}
                      onPress={() => step('submit', t('fin.submitted'))}
                    />
                  ) : null}
                  {a.approve ? (
                    <Button
                      label={t('fin.approve')}
                      disabled={w.busy}
                      onPress={() => step('approve', t('fin.approved'))}
                    />
                  ) : null}
                  {a.reject ? (
                    <Button kind="ghost" label={t('fin.reject')} onPress={() => setAsk('reject')} />
                  ) : null}
                  {a.cancel ? (
                    <Button
                      kind="ghost"
                      label={t('fin.vouchers.cancelVoucher')}
                      disabled={w.busy}
                      onPress={() => step('cancel', t('fin.cancelled'))}
                    />
                  ) : null}
                  {a.reverse ? (
                    <Button kind="ghost" label={t('fin.reverse')} onPress={() => setAsk('reverse')} />
                  ) : null}
                </View>
              )}
            </>
          );
        }}
      </ReadBox>
    </>
  );
}

function NewVoucher({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const w = useWrite();
  const [d, setD] = useState<VoucherDraft>({
    kind: 'JOURNAL',
    date: todayIST(),
    narration: '',
    branchId: '',
    ref: '',
    lines: [emptyLine(), emptyLine()],
    bankAccountId: '',
    fromAccountId: '',
    toAccountId: '',
    amount: '',
  });
  const [shown, setShown] = useState(false);
  const accts = useQuery({
    queryKey: ['fin', uid, 'accounts'],
    queryFn: ({ signal }) => listAccounts(client!, false, signal),
    enabled: client !== null,
  });
  const branches = useQuery({
    queryKey: ['fin', uid, 'branches'],
    queryFn: ({ signal }) => listBranches(client!, signal),
    enabled: client !== null,
    retry: false,
  });
  const set = (p: Partial<VoucherDraft>) => setD((x) => ({ ...x, ...p }));
  const setLine = (i: number, p: Partial<DraftLine>) =>
    setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const err = checkVoucher(d);
  const all = accts.data?.items ?? [];
  const opt = (xs: typeof all) => xs.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }));
  const diff = journalDiff(d.lines);
  const created = useRef('');
  const save = () => {
    setShown(true);
    if (err) return;
    const body = buildVoucher(d);
    void w.go(
      `create|${d.kind}|${JSON.stringify(body)}`,
      t('fin.vouchers.saved'),
      async (c, k) => {
        const v = await createVoucher(c, k, d.kind, body);
        created.current = v.id;
      },
      () => onDone(created.current),
    );
  };
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Gate query={accts} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        <Chips
          label={t('fin.vouchers.kind')}
          options={KINDS.map((k) => ({ id: k, label: t(`fin.vouchers.kind_${k}`) }))}
          value={d.kind}
          onChange={(k) =>
            set({ kind: k, lines: k === 'JOURNAL' ? [emptyLine(), emptyLine()] : [emptyLine()] })
          }
        />
        <Field
          label={t('fin.date')}
          value={d.date}
          onChange={(v) => set({ date: v })}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label={t('fin.vouchers.narration')}
          value={d.narration}
          onChange={(v) => set({ narration: v })}
        />
        {branches.data && branches.data.items.length > 1 ? (
          <Picker
            label={t('fin.branch')}
            blank={t('fin.wholeFranchise')}
            options={branches.data.items.map((b) => ({ id: b.id, label: b.name }))}
            value={d.branchId}
            onChange={(v) => set({ branchId: v })}
          />
        ) : null}
        <Field label={t('fin.vouchers.ref')} value={d.ref} onChange={(v) => set({ ref: v })} />
        {d.kind === 'CONTRA' ? (
          <>
            <Picker
              label={t('fin.vouchers.from')}
              options={opt(cashBankAccounts(all))}
              value={d.fromAccountId}
              onChange={(v) => set({ fromAccountId: v })}
            />
            <Picker
              label={t('fin.vouchers.to')}
              options={opt(cashBankAccounts(all))}
              value={d.toAccountId}
              onChange={(v) => set({ toAccountId: v })}
            />
            <Field
              label={t('fin.amount')}
              value={d.amount}
              onChange={(v) => set({ amount: v })}
              keyboard="decimal-pad"
            />
          </>
        ) : (
          <>
            {d.kind !== 'JOURNAL' ? (
              <Picker
                label={d.kind === 'PAYMENT' ? t('fin.vouchers.paidFrom') : t('fin.vouchers.receivedInto')}
                options={opt(cashBankAccounts(all))}
                value={d.bankAccountId}
                onChange={(v) => set({ bankAccountId: v })}
              />
            ) : null}
            {d.lines.map((l, i) => (
              <Card key={i}>
                <Picker
                  label={t('fin.vouchers.account', { n: i + 1 })}
                  options={opt(postableAccounts(all))}
                  value={l.accountId}
                  onChange={(v) => setLine(i, { accountId: v })}
                />
                {d.kind === 'JOURNAL' ? (
                  <>
                    <Field
                      label={t('fin.vouchers.debitN', { n: i + 1 })}
                      value={l.debit}
                      onChange={(v) => setLine(i, { debit: v, credit: v ? '' : l.credit })}
                      keyboard="decimal-pad"
                    />
                    <Field
                      label={t('fin.vouchers.creditN', { n: i + 1 })}
                      value={l.credit}
                      onChange={(v) => setLine(i, { credit: v, debit: v ? '' : l.debit })}
                      keyboard="decimal-pad"
                    />
                  </>
                ) : (
                  <Field
                    label={t('fin.vouchers.amountN', { n: i + 1 })}
                    value={l.amount}
                    onChange={(v) => setLine(i, { amount: v })}
                    keyboard="decimal-pad"
                  />
                )}
                <Field
                  label={t('fin.vouchers.lineNote', { n: i + 1 })}
                  value={l.narration}
                  onChange={(v) => setLine(i, { narration: v })}
                />
                {d.lines.length > 1 ? (
                  <Button
                    kind="ghost"
                    label={t('fin.vouchers.removeLine', { n: i + 1 })}
                    onPress={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}
                  />
                ) : null}
              </Card>
            ))}
            <Button
              kind="ghost"
              label={t('fin.vouchers.addLine')}
              onPress={() => setD((x) => ({ ...x, lines: [...x.lines, emptyLine()] }))}
            />
            {d.kind === 'JOURNAL' ? (
              <Text style={kit.sub}>{t('fin.vouchers.difference', { amount: formatINR(diff) })}</Text>
            ) : null}
          </>
        )}
        {shown && err ? <Notice tone="error" text={t(`fin.vouchers.err_${err}`)} /> : null}
        <Result w={w} />
        <Button label={t('fin.vouchers.saveDraft')} disabled={w.busy} onPress={save} />
        <Text style={kit.sub}>{t('fin.vouchers.postNext')}</Text>
      </Gate>
    </>
  );
}

function Entries() {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const [open, setOpen] = useState('');
  const to = todayIST();
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  return (
    <ReadBox
      queryKey={['fin', uid, 'journals', from, to]}
      client={client}
      enabled
      load={(c, s) => listJournals(c, from, to, s)}
      deniedText={t('fin.denied')}
      offlineText={t('fin.offline')}
    >
      {(d) =>
        d.items.length === 0 ? (
          <StateView state="empty" message={t('fin.vouchers.noEntries')} />
        ) : (
          <>
            {d.items.map((j) => (
              <Tap
                key={j.id}
                label={`${j.voucherNo ?? j.purpose} ${j.date}`}
                onPress={() => setOpen(open === j.id ? '' : j.id)}
              >
                <Text style={kit.name}>{j.voucherNo ?? j.purpose}</Text>
                <Text style={kit.sub}>{`${shortDate(j.date)} · ${j.narration ?? j.sourceType}`}</Text>
                <Line label={t('fin.total')} value={formatINR(j.debit)} strong />
                {open === j.id ? (
                  <ReadBox
                    queryKey={['fin', uid, 'journal', j.id]}
                    client={client}
                    enabled
                    load={(c, s) => getJournal(c, j.id, s)}
                    deniedText={t('fin.denied')}
                    offlineText={t('fin.offline')}
                  >
                    {(x) => (
                      <>
                        {(x.lines ?? []).map((l, i) => (
                          <Line
                            key={i}
                            label={`${l.accountCode} ${l.accountName}`}
                            value={`${formatINR(l.debit)} / ${formatINR(l.credit)}`}
                          />
                        ))}
                      </>
                    )}
                  </ReadBox>
                ) : null}
              </Tap>
            ))}
            <Text style={kit.sub}>{t('fin.vouchers.last100')}</Text>
          </>
        )
      }
    </ReadBox>
  );
}

export default function VouchersScreen() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const [view, setView] = useState<View2>({ mode: 'list' });
  const [tab, setTab] = useState<'vouchers' | 'entries'>('vouchers');
  const [status, setStatus] = useState<string>('');
  return (
    <Page title={t('fin.vouchers.title')} perm={FP.view}>
      {view.mode === 'new' ? (
        <NewVoucher
          onBack={() => setView({ mode: 'list' })}
          onDone={(id) => setView(id ? { mode: 'detail', id } : { mode: 'list' })}
        />
      ) : view.mode === 'detail' ? (
        <Detail id={view.id} onBack={() => setView({ mode: 'list' })} />
      ) : (
        <>
          <Chips
            label={t('fin.vouchers.show')}
            options={[
              { id: 'vouchers', label: t('fin.vouchers.tabVouchers') },
              { id: 'entries', label: t('fin.vouchers.tabEntries') },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'entries' ? (
            <Entries />
          ) : (
            <>
              {can(FP.voucherCreate) ? (
                <Button label={t('fin.vouchers.new')} onPress={() => setView({ mode: 'new' })} />
              ) : null}
              <Chips
                label={t('fin.statusFilter')}
                options={STATUSES.map((s) => ({ id: s, label: s ? t(`fin.status.${s}`) : t('fin.all') }))}
                value={status}
                onChange={setStatus}
              />
              <ReadBox
                queryKey={['fin', uid, 'vouchers', status]}
                client={client}
                enabled
                load={(c, s) => listVouchers(c, status ? { status } : {}, s)}
                deniedText={t('fin.denied')}
                offlineText={t('fin.offline')}
              >
                {(d) =>
                  d.items.length === 0 ? (
                    <StateView state="empty" message={t('fin.vouchers.empty')} />
                  ) : (
                    <>
                      {d.items.map((v) => (
                        <Tap
                          key={v.id}
                          label={v.voucherNo}
                          onPress={() => setView({ mode: 'detail', id: v.id })}
                        >
                          <Text style={kit.name}>{v.voucherNo}</Text>
                          <Text
                            style={kit.sub}
                          >{`${t(`fin.vouchers.kind_${v.kind}`, { defaultValue: v.kind })} · ${shortDate(v.voucherDate)} · ${t(`fin.status.${v.status}`, { defaultValue: v.status })}`}</Text>
                          <Text style={kit.sub}>{v.narration}</Text>
                          <Line label={t('fin.total')} value={formatINR(v.total)} strong />
                        </Tap>
                      ))}
                      <Text style={kit.sub}>{t('fin.vouchers.last100')}</Text>
                    </>
                  )
                }
              </ReadBox>
            </>
          )}
        </>
      )}
    </Page>
  );
}
