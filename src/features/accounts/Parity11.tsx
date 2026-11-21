import { useState } from 'react';
import { Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { saveTextAndShare } from '../admin/usr-files';
import { Card, Chips, Line, Notice, isNetwork, kit, useFailureText } from '../hr/kit';

// Web parity phase 11: the downloads of the web (finance.js reports `${path}.csv`, collections.js aging and write-off CSV,
// compliance.js GSTR-3B CSV, reports.js Excel) and the two finance reports the app did not have: branch-wise profit and the
// control-account reconciliation. Files are handed to the phone's share sheet; the app keeps no copy of its own.

type Query = Record<string, string | number | undefined>;
export const csvPath = (path: string) => `${path}.csv`;

/** GET the CSV text and share it. False when the phone cannot share. */
export async function shareCsv(c: ApiClient, path: string, query: Query, fileName: string): Promise<boolean> {
  const text = await c.get<string>(path, { query, as: 'text' });
  return saveTextAndShare(fileName, 'text/csv', text);
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** GET the Excel bytes and share them. False when the phone cannot share. */
export async function shareXlsx(
  c: ApiClient,
  path: string,
  query: Query,
  fileName: string,
): Promise<boolean> {
  const bytes = await c.get<Uint8Array>(path, { query: { ...query, format: 'xlsx' }, as: 'bytes' });
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'report.xlsx';
  const f = new File(Paths.cache, safe);
  f.create({ overwrite: true });
  f.write(bytes);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(f.uri, { mimeType: XLSX_MIME });
  return true;
}

/** One download button: runs `load`, shows that it was shared or why not. */
export function ShareButton({ label, load }: { label: string; load: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const fail = useFailureText();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <Button
        kind="ghost"
        label={label}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setMsg(null);
          void load()
            .then((ok) =>
              setMsg(ok ? { ok: true, text: t('wp11.shared') } : { ok: false, text: t('wp11.noSharing') }),
            )
            .catch((e: unknown) => setMsg({ ok: false, text: fail(e) }))
            .finally(() => setBusy(false));
        }}
      />
      {msg ? <Notice tone={msg.ok ? 'ok' : 'error'} text={msg.text} /> : null}
    </>
  );
}
/** The CSV of a finance report, like the web's "Download CSV" (`<path>.csv` with the same filters). */
export function CsvButton({ path, query, fileName }: { path: string; query: Query; fileName: string }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  return <ShareButton label={t('wp11.csv')} load={() => shareCsv(client!, csvPath(path), query, fileName)} />;
}

// ---- GSTR-3B CSV: the answer carries the file as text --------------------------------------------------------------------------
export async function shareGstr3bCsv(c: ApiClient, period: string): Promise<boolean> {
  const f = await c.get<{ fileName?: string; mimeType?: string; content?: string }>('/gst/gstr3b', {
    query: { period, format: 'csv' },
  });
  if (!f?.content) throw new Error('NO_FILE');
  return saveTextAndShare(f.fileName ?? `GSTR3B-${period}.csv`, f.mimeType ?? 'text/csv', f.content);
}

// ---- 11.x branch-wise profit -----------------------------------------------------------------------------------------------------
export interface PlFigures {
  netSales: string;
  costOfSales: string;
  grossProfit: string;
  operatingExpenses: string;
  otherIncome: string;
  netProfit: string;
}
export interface ByBranch {
  dimension: string;
  from: string | null;
  to: string;
  columns: { id: string | null; name: string; pl: PlFigures }[];
  consolidated: PlFigures;
  sumOfColumnsEqualsConsolidated: boolean;
}
export const PL_LINES: (keyof PlFigures)[] = [
  'netSales',
  'costOfSales',
  'grossProfit',
  'operatingExpenses',
  'otherIncome',
  'netProfit',
];
export type Dimension = 'branch' | 'cost_centre';
export const fetchByBranch = (
  c: ApiClient,
  from: string,
  to: string,
  dimension: Dimension,
  signal?: AbortSignal,
) => c.get<ByBranch>('/reports/profit-loss/by-branch', { query: { from, to, dimension }, signal });
export function BranchProfit({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [dim, setDim] = useState<Dimension>('branch');
  const q = useQuery({
    queryKey: ['statements', me?.userId ?? '', 'by-branch', from, to, dim],
    queryFn: ({ signal }) => fetchByBranch(client!, from, to, dim, signal),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const cols = q.data
    ? [
        ...q.data.columns.map((c) => ({ name: c.name, pl: c.pl })),
        { name: t('wp11.br.consolidated'), pl: q.data.consolidated },
      ]
    : [];
  return (
    <>
      <Chips
        label={t('wp11.br.by')}
        options={[
          { id: 'branch' as const, label: t('wp11.br.branch') },
          { id: 'cost_centre' as const, label: t('wp11.br.costCentre') },
        ]}
        value={dim}
        onChange={setDim}
      />
      <CsvButton
        path="/reports/profit-loss/by-branch"
        query={{ from, to, dimension: dim }}
        fileName={`profit-loss-by-${dim}-${to}.csv`}
      />
      {q.error ? <Notice tone="error" text={t('statements.offline')} /> : null}
      {q.data ? (
        <Notice
          tone={q.data.sumOfColumnsEqualsConsolidated ? 'ok' : 'error'}
          text={t(q.data.sumOfColumnsEqualsConsolidated ? 'wp11.br.adds' : 'wp11.br.notAdds')}
        />
      ) : null}
      {cols.map((c) => (
        <Card key={c.name}>
          <Text style={kit.name}>{c.name}</Text>
          {PL_LINES.map((k) => (
            <Line key={k} label={t(`wp11.br.${k}`)} value={formatINR(c.pl[k])} strong={k === 'netProfit'} />
          ))}
        </Card>
      ))}
    </>
  );
}

// ---- 11.x control-account reconciliation ----------------------------------------------------------------------------------------
export interface ReconSection {
  key: string;
  title: string;
  subLedger: string;
  glBalance: string;
  variance: string;
  reconciled: boolean;
}
export interface Reconciliation {
  asOn: string;
  reconciled: boolean;
  sections: ReconSection[];
}
export function ReconciliationView({ asOn }: { asOn: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const fail = useFailureText();
  const q = useQuery({
    queryKey: ['statements', me?.userId ?? '', 'recon', asOn],
    queryFn: ({ signal }) =>
      client!.get<Reconciliation>('/finance/reconciliation', { query: { asOn }, signal }),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <>
      <Text style={kit.sub}>{t('wp11.rc.hint')}</Text>
      {q.error ? <Notice tone="error" text={fail(q.error)} /> : null}
      {q.data ? (
        <Notice
          tone={q.data.reconciled ? 'ok' : 'error'}
          text={t(q.data.reconciled ? 'wp11.rc.ok' : 'wp11.rc.bad')}
        />
      ) : null}
      {(q.data?.sections ?? []).map((s) => (
        <Card key={s.key}>
          <Text style={kit.name}>{s.title}</Text>
          <Line label={t('wp11.rc.sub')} value={formatINR(s.subLedger)} />
          <Line label={t('wp11.rc.books')} value={formatINR(s.glBalance)} />
          <Line label={t('wp11.rc.diff')} value={formatINR(s.variance)} strong />
          <Text style={kit.sub}>{t(s.reconciled ? 'wp11.rc.agrees' : 'wp11.rc.differs')}</Text>
        </Card>
      ))}
    </>
  );
}

// ---- 11.4 / 11.5 a record opened in full (the web shows the raw answer) -----------------------------------------------------------
/** Pretty JSON of what the server sent, cut like the web at 20,000 characters. */
export const fullText = (x: unknown) => JSON.stringify(x, null, 2).slice(0, 20000);
export function DetailButton({
  path,
  pick,
  label,
}: {
  path: string;
  pick?: (x: Record<string, unknown>) => unknown;
  label: string;
}) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const fail = useFailureText();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <View style={{ gap: 4 }}>
      <Button
        kind="ghost"
        label={text ? t('wp11.close') : label}
        onPress={() => {
          if (text) return setText(null);
          setErr(null);
          void client!
            .get<Record<string, unknown>>(path)
            .then((x) => setText(fullText(pick ? pick(x) : x)))
            .catch((e: unknown) => setErr(fail(e)));
        }}
      />
      {err ? <Notice tone="error" text={err} /> : null}
      {text ? (
        <Text selectable style={[kit.sub, { fontFamily: 'monospace', fontSize: 12 }]}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}
