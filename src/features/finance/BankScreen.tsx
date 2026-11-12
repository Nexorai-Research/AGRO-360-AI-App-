import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { dec, formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { Check } from '@/ui/kit';
import { Line } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import {
  FP,
  autoMatch,
  createBank,
  getRec,
  lineMatch,
  lineStep,
  listBankLines,
  listBanks,
  patchBank,
  signRec,
  type BankAccount,
  type BankLine,
  type Rec,
} from './api';
import { Button, Card, Chips, Field, Notice, Page, Result, kit, useFin, useWrite } from './kit';
import { isDate, validAmount } from './logic';

const LINE_STATUS = ['', 'UNMATCHED', 'SUGGESTED', 'MATCHED', 'RECONCILED'] as const;

function AddBank({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const w = useWrite();
  const [f, setF] = useState({
    bankName: '',
    branchName: '',
    ifsc: '',
    holderName: '',
    accountNumber: '',
    upiVpa: '',
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const bad =
    !f.bankName.trim() ||
    !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifsc.trim()) ||
    !f.holderName.trim() ||
    !/^\d{6,20}$/.test(f.accountNumber.trim());
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Text style={kit.sub}>{t('fin.bank.encryptedNote')}</Text>
      <Field label={t('fin.bank.bankName')} value={f.bankName} onChange={(v) => set({ bankName: v })} />
      <Field label={t('fin.bank.bankBranch')} value={f.branchName} onChange={(v) => set({ branchName: v })} />
      <Field label={t('fin.bank.ifsc')} value={f.ifsc} onChange={(v) => set({ ifsc: v.toUpperCase() })} />
      <Field label={t('fin.bank.holder')} value={f.holderName} onChange={(v) => set({ holderName: v })} />
      <Field
        label={t('fin.bank.accountNumber')}
        value={f.accountNumber}
        onChange={(v) => set({ accountNumber: v })}
        keyboard="numeric"
      />
      <Field label={t('fin.bank.upi')} value={f.upiVpa} onChange={(v) => set({ upiVpa: v })} />
      {bad && (f.bankName || f.ifsc || f.accountNumber) ? (
        <Notice tone="error" text={t('fin.bank.badForm')} />
      ) : null}
      <Result w={w} />
      <Button
        label={t('fin.bank.add')}
        disabled={w.busy || bad}
        onPress={() => {
          const body = {
            bankName: f.bankName.trim(),
            ifsc: f.ifsc.trim(),
            holderName: f.holderName.trim(),
            accountNumber: f.accountNumber.trim(),
            ...(f.branchName.trim() ? { branchName: f.branchName.trim() } : {}),
            ...(f.upiVpa.trim() ? { upiVpa: f.upiVpa.trim() } : {}),
          };
          // the account number is sent once to the server; it is never stored in the app or logged
          void w.go(
            `add|${JSON.stringify(body)}`,
            t('fin.bank.added'),
            (c, k) => createBank(c, k, body),
            onBack,
          );
        }}
      />
    </>
  );
}

function EditBank({ b, onBack }: { b: BankAccount; onBack: () => void }) {
  const { t } = useTranslation();
  const w = useWrite();
  const [holder, setHolder] = useState(b.holderName);
  const [upi, setUpi] = useState(b.upiVpa ?? '');
  const [active, setActive] = useState(b.active);
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Text style={kit.name}>{`${b.bankName} ${b.accountNumberMasked}`}</Text>
      <Field label={t('fin.bank.holder')} value={holder} onChange={setHolder} />
      <Field label={t('fin.bank.upi')} value={upi} onChange={setUpi} />
      <Check label={t('fin.active')} value={active} onChange={setActive} />
      <Text style={kit.sub}>{t('fin.bank.activeNote')}</Text>
      <Result w={w} />
      <Button
        label={t('fin.save')}
        disabled={w.busy || !holder.trim()}
        onPress={() => {
          const body = { holderName: holder.trim(), upiVpa: upi.trim() || null, active };
          void w.go(`edit|${b.id}|${b.version}|${JSON.stringify(body)}`, t('fin.saved'), (c, k) =>
            patchBank(c, k, b, body),
          );
        }}
      />
    </>
  );
}

function Reconcile({ banks }: { banks: BankAccount[] }) {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const w = useWrite();
  const [bank, setBank] = useState(banks[0]?.id ?? '');
  const [status, setStatus] = useState('UNMATCHED');
  const [asOn, setAsOn] = useState(todayIST());
  const [balance, setBalance] = useState('');
  const [matching, setMatching] = useState<BankLine | null>(null);
  const [refused, setRefused] = useState('');
  const manage = can(FP.bankRec);
  const okDate = isDate(asOn);
  const act = (name: string, line: BankLine, step: 'accept' | 'unmatch', done: string) =>
    void w.go(`${name}|${line.id}|${line.status}`, done, (c, k) => lineStep(c, k, line.id, step));
  const candidates = (rec: Rec, l: BankLine) => {
    const dir = dec(l.deposit).gt(0) ? 'IN' : 'OUT';
    const amt = dec(l.deposit).gt(0) ? l.deposit : l.withdrawal;
    return rec.unmatchedBook.filter((e) => e.direction === dir && dec(e.amount).eq(amt));
  };
  return (
    <>
      <Chips
        label={t('fin.bank.which')}
        options={banks.map((b) => ({ id: b.id, label: `${b.bankName} ${b.accountNumberMasked}` }))}
        value={bank}
        onChange={setBank}
      />
      <Field label={t('fin.bank.asOn')} value={asOn} onChange={setAsOn} placeholder="YYYY-MM-DD" />
      {!okDate ? <Notice tone="error" text={t('fin.badDate')} /> : null}
      <Result w={w} />
      {refused ? <Notice tone="error" text={refused} /> : null}
      {okDate && bank ? (
        <ReadBox
          queryKey={['fin', uid, 'rec', bank, asOn]}
          client={client}
          enabled
          load={(c, s) => getRec(c, bank, asOn, s)}
          deniedText={t('fin.denied')}
          offlineText={t('fin.offline')}
        >
          {(rec) => (
            <>
              <Card>
                <Line label={t('fin.bank.bookBalance')} value={formatINR(rec.bookBalance)} />
                <Line
                  label={t('fin.bank.statementBalance')}
                  value={
                    rec.statementBalance === null ? t('fin.bank.notKnown') : formatINR(rec.statementBalance)
                  }
                />
                <Line label={t('fin.bank.depositsInTransit')} value={formatINR(rec.depositsInTransit)} />
                <Line label={t('fin.bank.outstandingPayments')} value={formatINR(rec.outstandingPayments)} />
                <Line label={t('fin.bank.bankOnlyIn')} value={formatINR(rec.bankOnlyDeposits)} />
                <Line label={t('fin.bank.bankOnlyOut')} value={formatINR(rec.bankOnlyWithdrawals)} />
                <Line
                  label={t('fin.bank.adjustedBank')}
                  value={rec.adjustedBank === null ? '-' : formatINR(rec.adjustedBank)}
                />
                <Line label={t('fin.bank.adjustedBook')} value={formatINR(rec.adjustedBook)} strong />
                {rec.signed ? (
                  <Notice tone="ok" text={t('fin.bank.signed', { date: shortDate(rec.signed.signedAt) })} />
                ) : rec.difference === null ? null : rec.reconciled ? (
                  <Notice tone="ok" text={t('fin.bank.agrees')} />
                ) : (
                  <Notice
                    tone="error"
                    text={t('fin.bank.difference', { amount: formatINR(rec.difference) })}
                  />
                )}
              </Card>
              {manage && !rec.signed ? (
                <Card>
                  <Field
                    label={t('fin.bank.enterBalance')}
                    value={balance}
                    onChange={setBalance}
                    keyboard="decimal-pad"
                  />
                  <View style={kit.row}>
                    <Button
                      label={t('fin.bank.sign')}
                      disabled={w.busy || !validAmount(balance)}
                      onPress={() =>
                        void w.go(
                          `sign|${bank}|${asOn}|${balance}`,
                          t('fin.bank.signedNow'),
                          async (c, k) => {
                            setRefused('');
                            const r = await signRec(c, k, bank, asOn, balance.trim());
                            if (r?.refused) {
                              setRefused(r.refused); // the server's own explanation (for example a difference that must not be plugged)
                              throw new Error('refused');
                            }
                          },
                        )
                      }
                    />
                    <Button
                      kind="ghost"
                      label={t('fin.bank.autoMatch')}
                      disabled={w.busy}
                      onPress={() =>
                        void w.go(`auto|${bank}|${asOn}`, t('fin.bank.autoDone'), (c, k) =>
                          autoMatch(c, k, bank),
                        )
                      }
                    />
                  </View>
                </Card>
              ) : null}
              <Chips
                label={t('fin.bank.lineStatus')}
                options={LINE_STATUS.map((s) => ({ id: s, label: s ? t(`fin.bank.st_${s}`) : t('fin.all') }))}
                value={status}
                onChange={setStatus}
              />
              <ReadBox
                queryKey={['fin', uid, 'lines', bank, status]}
                client={client}
                enabled
                load={(c, s) => listBankLines(c, bank, status, s)}
                deniedText={t('fin.denied')}
                offlineText={t('fin.offline')}
              >
                {(d) =>
                  d.items.length === 0 ? (
                    <StateView state="empty" message={t('fin.bank.noLines')} />
                  ) : (
                    <>
                      {d.items.map((l) => (
                        <Card key={l.id}>
                          <Text style={kit.name}>{l.narration}</Text>
                          <Text
                            style={kit.sub}
                          >{`${shortDate(l.date)}${l.reference ? ` · ${l.reference}` : ''} · ${t(`fin.bank.st_${l.status}`, { defaultValue: l.status })}`}</Text>
                          {dec(l.deposit).gt(0) ? (
                            <Line label={t('fin.bank.deposit')} value={formatINR(l.deposit)} />
                          ) : (
                            <Line label={t('fin.bank.withdrawal')} value={formatINR(l.withdrawal)} />
                          )}
                          {manage ? (
                            <View style={kit.row}>
                              {l.status === 'SUGGESTED' ? (
                                <Button
                                  label={t('fin.bank.accept', { n: l.narration })}
                                  disabled={w.busy}
                                  onPress={() => act('accept', l, 'accept', t('fin.bank.matched'))}
                                />
                              ) : null}
                              {l.status === 'MATCHED' ? (
                                <Button
                                  kind="ghost"
                                  label={t('fin.bank.unmatch', { n: l.narration })}
                                  disabled={w.busy}
                                  onPress={() => act('unmatch', l, 'unmatch', t('fin.bank.unmatched'))}
                                />
                              ) : null}
                              {l.status === 'UNMATCHED' || l.status === 'SUGGESTED' ? (
                                <Button
                                  kind="ghost"
                                  label={t('fin.bank.match', { n: l.narration })}
                                  onPress={() => setMatching(l)}
                                />
                              ) : null}
                            </View>
                          ) : null}
                          {matching?.id === l.id ? (
                            <>
                              {candidates(rec, l).length === 0 ? (
                                <Text style={kit.sub}>{t('fin.bank.noCandidate')}</Text>
                              ) : null}
                              {candidates(rec, l).map((e) => (
                                <Button
                                  key={e.journalLineId}
                                  kind="ghost"
                                  label={`${e.voucherNo ?? e.narration} ${shortDate(e.date)} ${formatINR(e.amount)}`}
                                  disabled={w.busy}
                                  onPress={() =>
                                    void w.go(
                                      `match|${l.id}|${e.journalLineId}`,
                                      t('fin.bank.matched'),
                                      (c, k) => lineMatch(c, k, l.id, e.journalLineId),
                                      () => setMatching(null),
                                    )
                                  }
                                />
                              ))}
                            </>
                          ) : null}
                        </Card>
                      ))}
                      <Text style={kit.sub}>{t('fin.bank.last100')}</Text>
                    </>
                  )
                }
              </ReadBox>
            </>
          )}
        </ReadBox>
      ) : null}
    </>
  );
}

type Mode = { m: 'list' } | { m: 'add' } | { m: 'edit'; b: BankAccount };

export default function BankScreen() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const [tab, setTab] = useState<'accounts' | 'rec'>('accounts');
  const [mode, setMode] = useState<Mode>({ m: 'list' });
  const back = () => setMode({ m: 'list' });
  return (
    <Page title={t('fin.bank.title')} perm={FP.view}>
      {mode.m === 'add' ? (
        <AddBank onBack={back} />
      ) : mode.m === 'edit' ? (
        <EditBank b={mode.b} onBack={back} />
      ) : (
        <>
          <Chips
            label={t('fin.vouchers.show')}
            options={[
              { id: 'accounts', label: t('fin.bank.tabAccounts') },
              { id: 'rec', label: t('fin.bank.tabRec') },
            ]}
            value={tab}
            onChange={setTab}
          />
          <ReadBox
            queryKey={['fin', uid, 'banks']}
            client={client}
            enabled
            load={(c, s) => listBanks(c, s)}
            deniedText={t('fin.denied')}
            offlineText={t('fin.offline')}
          >
            {(d) =>
              tab === 'rec' ? (
                d.items.filter((b) => b.active).length === 0 ? (
                  <StateView state="empty" message={t('fin.bank.addFirst')} />
                ) : (
                  <Reconcile banks={d.items.filter((b) => b.active)} />
                )
              ) : (
                <>
                  {can(FP.bankManage) ? (
                    <Button label={t('fin.bank.add')} onPress={() => setMode({ m: 'add' })} />
                  ) : null}
                  {d.items.length === 0 ? <StateView state="empty" message={t('fin.bank.empty')} /> : null}
                  {d.items.map((b) => (
                    <Card key={b.id}>
                      <Text
                        style={kit.name}
                      >{`${b.bankName}${b.branchName ? `, ${b.branchName}` : ''}`}</Text>
                      <Text style={kit.sub}>{`${b.accountNumberMasked} · ${b.ifsc} · ${b.holderName}`}</Text>
                      <Text
                        style={kit.sub}
                      >{`${b.ledgerCode} ${b.ledgerName} · ${b.active ? t('fin.active') : t('fin.inactive')}`}</Text>
                      <Line label={t('fin.chart.balance')} value={formatINR(b.balance)} strong />
                      {can(FP.bankManage) ? (
                        <Button
                          kind="ghost"
                          label={t('fin.bank.edit', { n: b.accountNumberMasked })}
                          onPress={() => setMode({ m: 'edit', b })}
                        />
                      ) : null}
                    </Card>
                  ))}
                </>
              )
            }
          </ReadBox>
        </>
      )}
    </Page>
  );
}
