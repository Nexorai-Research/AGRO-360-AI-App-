import { useState } from 'react';
import { Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { dec } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { listAccounts, type Account, type BankLine } from './api';
import { Button, Card, Chips, Field, Notice, kit, useFin, useWrite } from './kit';

// Web parity 3.1 / 3.2 (apps/web/src/pages/finance-ops.js importDlg, entryDlg).

// ---- 3.2 a bank charge or interest straight from a statement line ----------------------------------------------------------
/** A withdrawal becomes a CHARGE against an expense account, a deposit an INTEREST against an income account; control accounts are never offered. */
export const entryKind = (l: Pick<BankLine, 'withdrawal'>) =>
  dec(l.withdrawal).gt(0) ? 'CHARGE' : 'INTEREST';
export const entryAccounts = (accounts: Account[], kind: 'CHARGE' | 'INTEREST') =>
  accounts.filter((a) => (kind === 'CHARGE' ? a.type === 'EXPENSE' : a.type === 'INCOME') && !a.isControl);
export const postLineEntry = (c: ApiClient, key: string, lineId: string, kind: string, accountId: string) =>
  c.post<unknown>(`/finance/bank-lines/${encodeURIComponent(lineId)}/entry`, {
    idempotencyKey: key,
    body: { kind, accountId },
  });

export function LineEntry({ line, onDone }: { line: BankLine; onDone: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const w = useWrite();
  const kind = entryKind(line);
  const [account, setAccount] = useState('');
  return (
    <Card>
      <Text style={kit.name}>{t(kind === 'CHARGE' ? 'wp3.bank.charge' : 'wp3.bank.interest')}</Text>
      <Text style={kit.sub}>{t('wp3.bank.entryHint')}</Text>
      <ReadBox
        queryKey={['fin', uid, 'accounts-plain']}
        client={client}
        enabled
        load={(c, s) => listAccounts(c, false, s)}
        deniedText={t('fin.denied')}
        offlineText={t('fin.offline')}
      >
        {(d) => (
          <Chips
            label={t(kind === 'CHARGE' ? 'wp3.bank.expenseAccount' : 'wp3.bank.incomeAccount')}
            options={entryAccounts(d.items, kind).map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
            value={account}
            onChange={setAccount}
          />
        )}
      </ReadBox>
      {w.failure ? <Notice tone="error" text={w.failure} /> : null}
      <Button
        label={t('wp3.bank.record')}
        disabled={w.busy || !account}
        onPress={() =>
          void w.go(
            `entry|${line.id}|${account}`,
            t('wp3.bank.recorded'),
            (c, k) => postLineEntry(c, k, line.id, kind, account),
            onDone,
          )
        }
      />
      <Button kind="ghost" label={t('wp3.bank.cancel')} onPress={onDone} />
    </Card>
  );
}

// ---- 3.1 import a CSV statement --------------------------------------------------------------------------------------------
export interface Mapping {
  date: string;
  narration: string;
  reference: string;
  withdrawal: string;
  deposit: string;
  amount: string;
  balance: string;
}
export const defaultMapping = (): Mapping => ({
  date: 'Date',
  narration: 'Narration',
  reference: 'Reference',
  withdrawal: 'Withdrawal',
  deposit: 'Deposit',
  amount: '',
  balance: 'Balance',
});
/** Like the web: a signed amount column replaces withdrawal / deposit; blank optional columns are left out. */
export function mappingBody(m: Mapping): Record<string, string> {
  return {
    date: m.date.trim(),
    ...(m.narration.trim() ? { narration: m.narration.trim() } : {}),
    ...(m.reference.trim() ? { reference: m.reference.trim() } : {}),
    ...(m.amount.trim()
      ? { amount: m.amount.trim() }
      : { withdrawal: m.withdrawal.trim(), deposit: m.deposit.trim() }),
    ...(m.balance.trim() ? { balance: m.balance.trim() } : {}),
  };
}
export const mappingOk = (m: Mapping) =>
  m.date.trim() !== '' && (m.amount.trim() !== '' || (m.withdrawal.trim() !== '' && m.deposit.trim() !== ''));
interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  autoMatched: number;
  suggested: number;
  unmatched: number;
}
/** The phone's file picker for a CSV; the text is read from the picked copy. Null when cancelled. */
export async function pickCsv(): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { name: a.name, text: await new File(a.uri).text() };
}

export function ImportStatement({ bankId, onDone }: { bankId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const w = useWrite();
  const [m, setM] = useState<Mapping>(defaultMapping());
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const set = (k: keyof Mapping) => (v: string) => setM({ ...m, [k]: v });
  return (
    <Card>
      <Text style={kit.name}>{t('wp3.bank.importTitle')}</Text>
      <Text style={kit.sub}>{t('wp3.bank.importHint')}</Text>
      <Button
        kind="ghost"
        label={file ? file.name : t('wp3.bank.pick')}
        onPress={() =>
          void pickCsv()
            .then((f) => (f ? (setFile(f), setFileErr(null)) : undefined))
            .catch(() => setFileErr(t('wp3.bank.readFailed')))
        }
      />
      {fileErr ? <Notice tone="error" text={fileErr} /> : null}
      <Field label={t('wp3.bank.colDate')} value={m.date} onChange={set('date')} />
      <Field label={t('wp3.bank.colNarration')} value={m.narration} onChange={set('narration')} />
      <Field label={t('wp3.bank.colReference')} value={m.reference} onChange={set('reference')} />
      <Field label={t('wp3.bank.colWithdrawal')} value={m.withdrawal} onChange={set('withdrawal')} />
      <Field label={t('wp3.bank.colDeposit')} value={m.deposit} onChange={set('deposit')} />
      <Field label={t('wp3.bank.colAmount')} value={m.amount} onChange={set('amount')} />
      <Field label={t('wp3.bank.colBalance')} value={m.balance} onChange={set('balance')} />
      {!mappingOk(m) ? <Text style={kit.sub}>{t('wp3.bank.mappingBad')}</Text> : null}
      {w.failure ? <Notice tone="error" text={w.failure} /> : null}
      {res ? <Notice tone="ok" text={t('wp3.bank.imported', { ...res })} /> : null}
      <Button
        label={t('wp3.bank.import')}
        disabled={w.busy || !file || !mappingOk(m)}
        onPress={() => {
          if (!file) return;
          const body = {
            bankAccountId: bankId,
            fileName: file.name,
            csv: file.text,
            mapping: mappingBody(m),
          };
          void w.go(
            `import|${bankId}|${file.name}|${file.text.length}|${JSON.stringify(body.mapping)}`,
            t('wp3.bank.importDone'),
            async (c, k) => {
              const r = await c.post<ImportResult>('/finance/bank-statements/import', {
                idempotencyKey: k,
                body,
              });
              setRes(r);
            },
          );
        }}
      />
      <Button kind="ghost" label={t('wp3.bank.close')} onPress={onDone} />
    </Card>
  );
}
