import { useState } from 'react';
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
  countApprove,
  countReject,
  createFund,
  fundCount,
  fundExpense,
  fundReplenish,
  listAccounts,
  listBranches,
  listCounts,
  listFunds,
  type Fund,
} from './api';
import { Ask, Button, Card, Field, Notice, Page, Picker, Result, kit, useFin, useWrite } from './kit';
import { cashBankAccounts, expenseAccounts, isDate, validAmount } from './logic';

type Act = 'spend' | 'replenish' | 'count' | 'counts';

function NewFund({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const w = useWrite();
  const br = useQuery({
    queryKey: ['fin', uid, 'branches'],
    queryFn: ({ signal }) => listBranches(client!, signal),
    enabled: client !== null,
  });
  const [branchId, setBranchId] = useState('');
  const [floatAmount, setFloat] = useState('');
  const [custodian, setCustodian] = useState('');
  const bad = !branchId || !validAmount(floatAmount) || !custodian.trim();
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Text style={kit.sub}>{t('fin.petty.oneFund')}</Text>
      <Gate query={br} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        <Picker
          label={t('fin.branch')}
          options={(br.data?.items ?? []).map((b) => ({ id: b.id, label: b.name }))}
          value={branchId}
          onChange={setBranchId}
        />
        <Field label={t('fin.petty.float')} value={floatAmount} onChange={setFloat} keyboard="decimal-pad" />
        <Field label={t('fin.petty.custodian')} value={custodian} onChange={setCustodian} />
        <Result w={w} />
        <Button
          label={t('fin.petty.create')}
          disabled={w.busy || bad}
          onPress={() => {
            const body = { branchId, floatAmount: floatAmount.trim(), custodian: custodian.trim() };
            void w.go(
              `new|${JSON.stringify(body)}`,
              t('fin.petty.created'),
              (c, k) => createFund(c, k, body),
              onBack,
            );
          }}
        />
      </Gate>
    </>
  );
}

function FundAction({ f, act, onClose }: { f: Fund; act: Act; onClose: () => void }) {
  const { t } = useTranslation();
  const { client, uid, can } = useFin();
  const w = useWrite();
  const accts = useQuery({
    queryKey: ['fin', uid, 'accounts'],
    queryFn: ({ signal }) => listAccounts(client!, false, signal),
    enabled: client !== null && (act === 'spend' || act === 'replenish'),
  });
  const [date, setDate] = useState(todayIST());
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [slip, setSlip] = useState('');
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState('');
  const all = accts.data?.items ?? [];
  const opt = (xs: typeof all) => xs.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }));
  const dateBad = !isDate(date);
  return (
    <Card>
      <Text style={kit.name}>{t(`fin.petty.act_${act}`, { branch: f.branchName })}</Text>
      {act === 'counts' ? (
        <ReadBox
          queryKey={['fin', uid, 'counts', f.id]}
          client={client}
          enabled
          load={(c, s) => listCounts(c, f.id, s)}
          deniedText={t('fin.denied')}
          offlineText={t('fin.offline')}
        >
          {(d) => (
            <>
              {d.items.length === 0 ? <StateView state="empty" message={t('fin.petty.noCounts')} /> : null}
              {d.items.map((x) => (
                <Card key={x.id}>
                  <Text
                    style={kit.sub}
                  >{`${shortDate(x.countedOn)} · ${t(`fin.status.${x.status}`, { defaultValue: x.status })}`}</Text>
                  <Line label={t('fin.petty.counted')} value={formatINR(x.countedAmount)} />
                  <Line label={t('fin.petty.books')} value={formatINR(x.bookAmount)} />
                  <Line label={t('fin.petty.difference')} value={formatINR(x.difference)} strong />
                  {x.status === 'PENDING_APPROVAL' && can(FP.voucherApprove) ? (
                    rejecting === x.id ? (
                      <Ask
                        label={t('fin.reasonReject')}
                        confirm={t('fin.reject')}
                        busy={w.busy}
                        onCancel={() => setRejecting('')}
                        onConfirm={(text) =>
                          void w.go(
                            `rej|${x.id}|${text}`,
                            t('fin.rejected'),
                            (c, k) => countReject(c, k, x.id, text),
                            () => setRejecting(''),
                          )
                        }
                      />
                    ) : (
                      <View style={kit.row}>
                        <Button
                          label={t('fin.petty.approveCount', { date: shortDate(x.countedOn) })}
                          disabled={w.busy}
                          onPress={() =>
                            void w.go(`appr|${x.id}`, t('fin.petty.differencePosted'), (c, k) =>
                              countApprove(c, k, x.id),
                            )
                          }
                        />
                        <Button
                          kind="ghost"
                          label={t('fin.petty.rejectCount', { date: shortDate(x.countedOn) })}
                          onPress={() => setRejecting(x.id)}
                        />
                      </View>
                    )
                  ) : null}
                </Card>
              ))}
            </>
          )}
        </ReadBox>
      ) : (
        <Gate query={accts} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
          <Field label={t('fin.date')} value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
          {act === 'spend' ? (
            <>
              <Text style={kit.sub}>{t('fin.petty.inBox', { amount: formatINR(f.balance) })}</Text>
              <Picker
                label={t('fin.expenses.category')}
                options={opt(expenseAccounts(all))}
                value={accountId}
                onChange={setAccountId}
              />
              <Field label={t('fin.amount')} value={amount} onChange={setAmount} keyboard="decimal-pad" />
              <Field label={t('fin.petty.whatFor')} value={narration} onChange={setNarration} />
              <Field label={t('fin.petty.slip')} value={slip} onChange={setSlip} />
            </>
          ) : null}
          {act === 'replenish' ? (
            <>
              <Text style={kit.sub}>
                {t('fin.petty.topUp', { amount: formatINR(f.toReplenish), float: formatINR(f.floatAmount) })}
              </Text>
              <Picker
                label={t('fin.petty.from')}
                options={opt(cashBankAccounts(all))}
                value={accountId}
                onChange={setAccountId}
              />
            </>
          ) : null}
          {act === 'count' ? (
            <>
              <Text style={kit.sub}>{t('fin.petty.booksSay', { amount: formatINR(f.balance) })}</Text>
              <Field
                label={t('fin.petty.cashCounted')}
                value={amount}
                onChange={setAmount}
                keyboard="decimal-pad"
              />
              <Field label={t('fin.petty.note')} value={note} onChange={setNote} />
            </>
          ) : null}
          {dateBad ? <Notice tone="error" text={t('fin.badDate')} /> : null}
          <Result w={w} />
          <View style={kit.row}>
            <Button
              label={t('fin.petty.submitAct')}
              disabled={
                w.busy ||
                dateBad ||
                (act === 'spend' && (!accountId || !validAmount(amount) || !narration.trim())) ||
                (act === 'replenish' && !accountId) ||
                (act === 'count' && !/^\d+(\.\d{1,2})?$/.test(amount.trim()))
              }
              onPress={() => {
                if (act === 'spend') {
                  const body = {
                    date,
                    accountId,
                    amount: amount.trim(),
                    narration: narration.trim(),
                    ...(slip.trim() ? { slipRef: slip.trim() } : {}),
                  };
                  void w.go(`spend|${f.id}|${JSON.stringify(body)}`, t('fin.petty.spent'), (c, k) =>
                    fundExpense(c, k, f.id, body),
                  );
                } else if (act === 'replenish') {
                  const body = { fromAccountId: accountId, date };
                  void w.go(`rep|${f.id}|${JSON.stringify(body)}`, t('fin.petty.replenished'), (c, k) =>
                    fundReplenish(c, k, f.id, body),
                  );
                } else {
                  const body = {
                    countedAmount: amount.trim(),
                    date,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  };
                  void w.go(`count|${f.id}|${JSON.stringify(body)}`, t('fin.petty.counted_done'), (c, k) =>
                    fundCount(c, k, f.id, body),
                  );
                }
              }}
            />
          </View>
        </Gate>
      )}
      <Button kind="ghost" label={t('fin.close')} onPress={onClose} />
    </Card>
  );
}

export default function PettyScreen() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<{ id: string; act: Act } | null>(null);
  const manage = can(FP.petty);
  return (
    <Page title={t('fin.petty.title')} perm={FP.view}>
      {adding ? (
        <NewFund onBack={() => setAdding(false)} />
      ) : (
        <>
          {manage ? <Button label={t('fin.petty.new')} onPress={() => setAdding(true)} /> : null}
          <ReadBox
            queryKey={['fin', uid, 'funds']}
            client={client}
            enabled
            load={(c, s) => listFunds(c, s)}
            deniedText={t('fin.denied')}
            offlineText={t('fin.offline')}
          >
            {(d) =>
              d.items.length === 0 ? (
                <StateView state="empty" message={t('fin.petty.empty')} />
              ) : (
                <>
                  {d.items.map((f) => (
                    <Card key={f.id}>
                      <Text style={kit.name}>{`${f.branchName} · ${f.ledgerCode}`}</Text>
                      <Text style={kit.sub}>{t('fin.petty.custodianLine', { name: f.custodian })}</Text>
                      <Line label={t('fin.petty.float')} value={formatINR(f.floatAmount)} />
                      <Line label={t('fin.petty.balance')} value={formatINR(f.balance)} strong />
                      <Line label={t('fin.petty.toTopUp')} value={formatINR(f.toReplenish)} />
                      {f.lastCount ? (
                        <Text style={kit.sub}>
                          {t('fin.petty.lastCount', {
                            date: shortDate(f.lastCount.countedOn),
                            diff: formatINR(f.lastCount.difference),
                          })}
                        </Text>
                      ) : null}
                      <View style={kit.row}>
                        {manage ? (
                          <Button
                            kind="ghost"
                            label={t('fin.petty.spend', { branch: f.branchName })}
                            onPress={() => setSel({ id: f.id, act: 'spend' })}
                          />
                        ) : null}
                        {manage ? (
                          <Button
                            kind="ghost"
                            label={t('fin.petty.replenish', { branch: f.branchName })}
                            onPress={() => setSel({ id: f.id, act: 'replenish' })}
                          />
                        ) : null}
                        {manage ? (
                          <Button
                            kind="ghost"
                            label={t('fin.petty.count', { branch: f.branchName })}
                            onPress={() => setSel({ id: f.id, act: 'count' })}
                          />
                        ) : null}
                        <Button
                          kind="ghost"
                          label={t('fin.petty.counts', { branch: f.branchName })}
                          onPress={() => setSel({ id: f.id, act: 'counts' })}
                        />
                      </View>
                      {sel?.id === f.id ? (
                        <FundAction f={f} act={sel.act} onClose={() => setSel(null)} />
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
