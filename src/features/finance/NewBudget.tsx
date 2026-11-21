import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FP, createBudget, listAccounts, listPeriods } from './api';
import { Button, Card, Chips, Field, Notice, Picker, Result, kit, useFin, useWrite } from './kit';
import { budgetBody, budgetErrors, type BudgetForm } from './logic';

// Web parity 9a.2 (apps/web/src/pages/finance-ops.js budgetsTab newBudget): name, financial year, up to three income / expense
// accounts with a monthly amount that is spread over the 12 months. Saved as a draft; month-by-month changes are made on the web.
const blank = (): BudgetForm => ({
  name: 'Annual budget',
  fyLabel: '',
  rows: [0, 1, 2].map(() => ({ accountId: '', monthly: '' })),
});

export function NewBudget() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const w = useWrite();
  const [f, setF] = useState<BudgetForm | null>(null);
  const [tried, setTried] = useState(false);
  const years = useQuery({
    queryKey: ['fin', uid, 'periods'],
    queryFn: ({ signal }) => listPeriods(client!, signal),
    enabled: client !== null && f !== null,
  });
  const accts = useQuery({
    queryKey: ['fin', uid, 'accounts'],
    queryFn: ({ signal }) => listAccounts(client!, false, signal),
    enabled: client !== null && f !== null,
  });
  if (!can(FP.budgetManage)) return null;
  if (!f)
    return (
      <>
        <Result w={w} />
        <Button kind="ghost" label={t('wp9.b.new')} onPress={() => (setF(blank()), setTried(false))} />
      </>
    );
  const labels = (years.data?.items ?? []).map((y) => y.label);
  const pl = (accts.data?.items ?? [])
    .filter((a) => (a.type === 'INCOME' || a.type === 'EXPENSE') && a.active && !a.isControl)
    .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }));
  const errs = budgetErrors(f);
  const setRow = (i: number, p: Partial<BudgetForm['rows'][number]>) =>
    setF({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <Card>
      <Text style={kit.name}>{t('wp9.b.title')}</Text>
      <Text style={kit.sub}>{t('wp9.b.hint')}</Text>
      <Field
        label={t('wp9.b.name')}
        value={f.name}
        onChange={(name) => setF({ ...f, name })}
        error={tried && errs.includes('name') ? t('wp9.b.v.name') : null}
      />
      {years.data && labels.length === 0 ? <Notice tone="warn" text={t('wp9.b.noYear')} /> : null}
      <Chips
        label={t('wp9.b.year')}
        options={labels.map((l) => ({ id: l, label: l }))}
        value={f.fyLabel}
        onChange={(fyLabel) => setF({ ...f, fyLabel })}
      />
      {tried && errs.includes('year') ? <Text style={kit.sub}>{t('wp9.b.v.year')}</Text> : null}
      {f.rows.map((r, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Picker
            label={t('wp9.b.account', { n: i + 1 })}
            blank={i === 0 ? undefined : t('wp9.b.none')}
            options={pl}
            value={r.accountId}
            onChange={(accountId) => setRow(i, { accountId })}
          />
          <Field
            label={t('wp9.b.monthly', { n: i + 1 })}
            value={r.monthly}
            onChange={(monthly) => setRow(i, { monthly })}
            keyboard="decimal-pad"
          />
        </View>
      ))}
      {tried && (errs.includes('rows') || errs.includes('amount')) ? (
        <Notice tone="error" text={t(errs.includes('rows') ? 'wp9.b.v.rows' : 'wp9.b.v.amount')} />
      ) : null}
      <Result w={w} />
      <View style={kit.row}>
        <Button
          label={t('wp9.b.save')}
          disabled={w.busy}
          onPress={() => {
            setTried(true);
            if (errs.length > 0) return;
            const body = budgetBody(f);
            void w.go(
              `budget|${JSON.stringify(body)}`,
              t('wp9.b.saved'),
              (c, k) => createBudget(c, k, body),
              () => setF(null),
            );
          }}
        />
        <Button kind="ghost" label={t('fin.cancel')} onPress={() => setF(null)} />
      </View>
    </Card>
  );
}
