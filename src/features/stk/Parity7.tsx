import { useState } from 'react';
import { Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '@/api/client';
import { Button } from '@/ui/Button';
import { saveTextAndShare } from '../admin/usr-files';
import { admKey, fetchImportReport } from '../adm/api';
import { useAction, useActionKey, useFailureText } from '../hr/kit';
import { Area, Btn, Card, Check, Field, Msgs, Notice, kit, useStk, useWrite } from './kit';

// Web parity phase 7 (apps/web/src/pages/products.js io, composition and labels tabs). Field rules copied from
// modules/catalogue/src/application/import-export.ts, domain/catalogue.ts (readComposition, parseIngredient, parseLabelRequest).

// ---- 7.1 / 7.2 product import and export ----------------------------------------------------------------------------------------
export const CSV_MAX = 12_000_000;
export const XLSX_MAX = 5_500_000;
export interface PickedSheet {
  name: string;
  /** CSV text, or the .xlsx file as base64. */
  data: string;
  xlsx: boolean;
}
export const isXlsx = (name: string) => /\.xlsx$/i.test(name);
export function sheetError(f: PickedSheet | null): 'file' | 'size' | null {
  if (!f) return 'file';
  if (f.data.length < 1 || f.data.length > (f.xlsx ? XLSX_MAX : CSV_MAX)) return 'size';
  return null;
}
/** Like the web: either csv (text) or xlsx (base64), never both; the HSN flag only when ticked. */
export const importBody = (f: PickedSheet, confirmUnknownHsn: boolean) => ({
  ...(f.xlsx ? { xlsx: f.data } : { csv: f.data }),
  filename: f.name.slice(0, 200),
  ...(confirmUnknownHsn ? { confirmUnknownHsn: true } : {}),
});
export async function pickSheet(): Promise<PickedSheet | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'text/comma-separated-values',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const file = new File(a.uri);
  const xlsx = isXlsx(a.name);
  return { name: a.name, xlsx, data: xlsx ? await file.base64() : await file.text() };
}
export interface ImportSummary {
  jobId: string;
  status: string;
  totalRows: number;
  createRows: number;
  updateRows: number;
  unchangedRows: number;
  errorRows: number;
  errors: { row: number; column: string; message: string }[];
}
export const validateProductImport = (c: ApiClient, body: Record<string, unknown>, key: string) =>
  c.post<ImportSummary>('/products/import', { body, idempotencyKey: key });
export const commitProductImport = (
  c: ApiClient,
  jobId: string,
  mode: 'ALL_OR_NOTHING' | 'ROW_WISE',
  key: string,
) =>
  c.post<ImportSummary>(`/products/import/${encodeURIComponent(jobId)}/commit`, {
    body: { mode },
    idempotencyKey: key,
  });
const SHOWN_ERRORS = 50;

export function ProductImportCard() {
  const { t, client, can, userId } = useStk();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const fail = useFailureText();
  const [file, setFile] = useState<PickedSheet | null>(null);
  const [hsn, setHsn] = useState(false);
  const [sum, setSum] = useState<ImportSummary | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const canImport = can('product.import');
  const canExport = can('product.export');
  if (!canImport && !canExport) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: admKey(userId, 'imports') });
  // a file is handed to the phone's share sheet; the app keeps no copy of its own
  const share = (name: string, load: () => Promise<string>) =>
    void load()
      .then((text) => saveTextAndShare(name, 'text/csv', text))
      .then((ok) => setSaveMsg(ok ? null : t('wp7.io.noSharing')))
      .catch((e: unknown) => setSaveMsg(fail(e)));
  const err = sheetError(file);
  return (
    <Card>
      <Text style={kit.name}>{t('wp7.io.title')}</Text>
      {canExport ? (
        <Button
          kind="ghost"
          label={t('wp7.io.export')}
          onPress={() => share('products.csv', () => client!.get<string>('/products/export', { as: 'text' }))}
        />
      ) : null}
      {canImport ? (
        <Button
          kind="ghost"
          label={t('wp7.io.template')}
          onPress={() =>
            share('product-template.csv', () =>
              client!.get<string>('/products/import/template', { as: 'text' }),
            )
          }
        />
      ) : null}
      {saveMsg ? <Notice tone="error" text={saveMsg} /> : null}
      {canImport ? (
        <>
          <Text style={kit.sub}>{t('wp7.io.hint')}</Text>
          <Button
            kind="ghost"
            label={file ? file.name : t('wp7.io.pick')}
            onPress={() =>
              void pickSheet()
                .then((f) =>
                  f ? (setFile(f), setSum(null), setFileErr(null), keys.reset(), act.clear()) : undefined,
                )
                .catch(() => setFileErr(t('wp7.io.readFailed')))
            }
          />
          {fileErr ? <Notice tone="error" text={fileErr} /> : null}
          {file && err === 'size' ? <Notice tone="error" text={t('wp7.io.size')} /> : null}
          <Check label={t('wp7.io.hsn')} value={hsn} onChange={setHsn} />
          {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
          {act.failure ? <Notice tone="error" text={act.failure} /> : null}
          <Button
            label={t('wp7.io.validate')}
            disabled={act.busy || err !== null}
            onPress={() => {
              if (!file) return;
              const body = importBody(file, hsn);
              void act.run(
                async () =>
                  setSum(
                    await validateProductImport(
                      client!,
                      body,
                      keys.keyFor(`imp|${file.name}|${file.data.length}|${hsn}`),
                    ),
                  ),
                t('wp7.io.checked'),
                refresh,
              );
            }}
          />
          {sum ? (
            <>
              <Text style={kit.sub}>
                {t('wp7.io.summary', {
                  total: sum.totalRows,
                  create: sum.createRows,
                  update: sum.updateRows,
                  same: sum.unchangedRows,
                  errors: sum.errorRows,
                })}
                {sum.status === 'COMMITTED' ? ` ${t('wp7.io.committed')}` : ''}
              </Text>
              {sum.errors.slice(0, SHOWN_ERRORS).map((e, i) => (
                <Text key={i} style={kit.sub}>
                  {t('wp7.io.error', { row: e.row, column: e.column, message: e.message })}
                </Text>
              ))}
              {sum.errors.length > SHOWN_ERRORS ? (
                <Text style={kit.sub}>
                  {t('wp7.io.moreErrors', { count: sum.errors.length - SHOWN_ERRORS })}
                </Text>
              ) : null}
              {sum.status === 'VALIDATED' ? (
                <>
                  <Button
                    label={t('wp7.io.all')}
                    disabled={act.busy}
                    onPress={() =>
                      void act.run(
                        async () =>
                          setSum(
                            await commitProductImport(
                              client!,
                              sum.jobId,
                              'ALL_OR_NOTHING',
                              keys.keyFor(`all|${sum.jobId}`),
                            ),
                          ),
                        t('wp7.io.imported'),
                        refresh,
                      )
                    }
                  />
                  <Button
                    kind="ghost"
                    label={t('wp7.io.valid')}
                    disabled={act.busy}
                    onPress={() =>
                      void act.run(
                        async () =>
                          setSum(
                            await commitProductImport(
                              client!,
                              sum.jobId,
                              'ROW_WISE',
                              keys.keyFor(`row|${sum.jobId}`),
                            ),
                          ),
                        t('wp7.io.imported'),
                        refresh,
                      )
                    }
                  />
                </>
              ) : null}
              <Button
                kind="ghost"
                label={t('wp7.io.report')}
                onPress={() => share('import-report.csv', () => fetchImportReport(client!, sum.jobId))}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

// ---- 7.3 composition and the ingredient master --------------------------------------------------------------------------------
export const FORMULATIONS = ['EC', 'WP', 'SC', 'SL', 'WG', 'DP', 'GR', 'FS', 'OTHER'] as const;
export interface Ingredient {
  id: string;
  name: string;
  banned?: boolean;
}
export interface CompositionRow {
  ingredientId: string;
  percentage: string;
  formulation?: string;
}
export type CompositionProblem = 'format' | 'unknown' | 'pct' | 'formulation' | 'twice' | 'tooMany';
/** "Name, percentage, formulation" per line, like the web dialog. Returns the rows, or the first bad line and why. */
export function parseCompositionLines(
  text: string,
  master: Ingredient[],
): { rows: CompositionRow[] } | { line: number; problem: CompositionProblem; name?: string } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 50) return { line: 51, problem: 'tooMany' };
  const rows: CompositionRow[] = [];
  const seen = new Set<string>();
  for (const [i, l] of lines.entries()) {
    const [n, pct, fm] = l.split(',').map((s) => s.trim());
    if (!n || pct === undefined) return { line: i + 1, problem: 'format' };
    const g = master.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (!g) return { line: i + 1, problem: 'unknown', name: n };
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(pct) || Number(pct) > 100) return { line: i + 1, problem: 'pct' };
    const f = fm ? fm.toUpperCase() : undefined;
    if (f && !(FORMULATIONS as readonly string[]).includes(f)) return { line: i + 1, problem: 'formulation' };
    if (seen.has(g.id)) return { line: i + 1, problem: 'twice' };
    seen.add(g.id);
    rows.push({ ingredientId: g.id, percentage: pct, ...(f ? { formulation: f } : {}) });
  }
  return { rows };
}
export const compositionText = (
  items: { ingredientName: string; percentage: string; formulation: string | null }[],
) =>
  items
    .map((x) => `${x.ingredientName}, ${x.percentage}${x.formulation ? `, ${x.formulation}` : ''}`)
    .join('\n');
export function ingredientErrors(f: {
  name: string;
  banned: boolean;
  banReason: string;
}): ('name' | 'banReason')[] {
  const e: ('name' | 'banReason')[] = [];
  if (f.name.trim().length < 1 || f.name.trim().length > 120) e.push('name');
  if (f.banned && (f.banReason.trim() === '' || f.banReason.trim().length > 500)) e.push('banReason');
  return e;
}
export const ingredientBody = (f: { name: string; banned: boolean; banReason: string }) => ({
  name: f.name.trim(),
  ...(f.banned ? { banned: true, banReason: f.banReason.trim() } : {}),
});

/** Edit the composition and add to the ingredient master, under the read-only composition list. */
export function CompositionEdit({
  id,
  items,
}: {
  id: string;
  items: { ingredientName: string; percentage: string; formulation: string | null }[];
}) {
  const { t, client, can, userId, ready } = useStk();
  const w = useWrite();
  const [text, setText] = useState<string | null>(null);
  const [ing, setIng] = useState<{ name: string; banned: boolean; banReason: string } | null>(null);
  const [tried, setTried] = useState(false);
  const master = useQuery({
    queryKey: ['stk', userId, '/ingredients'],
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: Ingredient[] }>('/ingredients', { signal })).items,
    enabled: ready && (text !== null || ing !== null),
  });
  if (!can('product.update')) return null;
  const parsed = text !== null && master.data ? parseCompositionLines(text, master.data) : null;
  const ingErrs = ing ? ingredientErrors(ing) : [];
  return (
    <>
      <Msgs w={w} />
      {text === null ? (
        <Btn
          kind="ghost"
          label={t('wp7.comp.edit')}
          onPress={() => (setText(compositionText(items)), setIng(null))}
        />
      ) : (
        <Card>
          <Text style={kit.sub}>{t('wp7.comp.hint')}</Text>
          <Area label={t('wp7.comp.rows')} value={text} onChange={setText} />
          {parsed && 'problem' in parsed ? (
            <Text style={kit.sub}>
              {t(`wp7.comp.p.${parsed.problem}`, { line: parsed.line, name: parsed.name ?? '' })}
            </Text>
          ) : null}
          <Btn
            label={t('wp7.comp.save')}
            disabled={w.busy || !parsed || 'problem' in parsed}
            onPress={() => {
              if (!parsed || 'problem' in parsed) return;
              void w.put(`/products/${id}/composition`, { rows: parsed.rows }, t('wp7.comp.saved'), {
                after: () => setText(null),
              });
            }}
          />
          <Btn kind="ghost" label={t('wp7.cancel')} onPress={() => setText(null)} />
        </Card>
      )}
      {ing === null ? (
        <Btn
          kind="ghost"
          label={t('wp7.ing.open')}
          onPress={() => (setIng({ name: '', banned: false, banReason: '' }), setTried(false), setText(null))}
        />
      ) : (
        <Card>
          <Text style={kit.name}>{t('wp7.ing.title')}</Text>
          <Field
            label={t('wp7.ing.name')}
            value={ing.name}
            onChange={(name) => setIng({ ...ing, name })}
            error={tried && ingErrs.includes('name') ? t('wp7.ing.v.name') : null}
          />
          {can('product.regulated') ? (
            <>
              <Check
                label={t('wp7.ing.banned')}
                value={ing.banned}
                onChange={(banned) => setIng({ ...ing, banned })}
              />
              {ing.banned ? (
                <Field
                  label={t('wp7.ing.banReason')}
                  value={ing.banReason}
                  onChange={(banReason) => setIng({ ...ing, banReason })}
                  error={tried && ingErrs.includes('banReason') ? t('wp7.ing.v.banReason') : null}
                />
              ) : null}
            </>
          ) : null}
          <Btn
            label={t('wp7.ing.save')}
            disabled={w.busy}
            onPress={() => {
              setTried(true);
              if (ingErrs.length > 0) return;
              void w.post('/ingredients', ingredientBody(ing), t('wp7.ing.saved'), {
                after: () => setIng(null),
              });
            }}
          />
          <Btn kind="ghost" label={t('wp7.cancel')} onPress={() => setIng(null)} />
        </Card>
      )}
    </>
  );
}

// ---- 7.4 label sheet --------------------------------------------------------------------------------------------------------------
export interface LabelLine {
  code: string;
  copies: number;
}
/** "code, copies" per line (copies 1-500, default 1), at most 200 products, like the web and parseLabelRequest. */
export function parseLabelLines(text: string): { lines: LabelLine[] } | { line: number } {
  const out: LabelLine[] = [];
  const all = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (all.length === 0 || all.length > 200) return { line: all.length === 0 ? 1 : 201 };
  for (const [i, l] of all.entries()) {
    const [code, n] = l.split(',').map((s) => s.trim());
    const copies = n === undefined || n === '' ? 1 : Number(n);
    if (!code || !Number.isInteger(copies) || copies < 1 || copies > 500) return { line: i + 1 };
    out.push({ code, copies });
  }
  return { lines: out };
}
export interface LabelView {
  name: string;
  packSize: string | null;
  packUnit: string | null;
  mrp: string | null;
  sellingPrice: string | null;
  barcode: string | null;
  copies: number;
}
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** An A4 sheet of labels as HTML for the phone's PDF maker. The barcode is printed as its digits. */
export function labelsHtml(labels: LabelView[], mrpWord: string): string {
  const cells = labels.flatMap((l) =>
    Array.from(
      { length: l.copies },
      () =>
        `<div class="l"><b>${esc(l.name)}</b><div>${l.packSize ? `${esc(l.packSize)} ${esc(l.packUnit ?? '')} ` : ''}${esc(mrpWord)} ${esc(l.mrp ?? '-')} | ${esc(l.sellingPrice ?? '-')}</div><div class="b">${esc(l.barcode ?? '')}</div></div>`,
    ),
  );
  return `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;margin:8mm}.g{display:flex;flex-wrap:wrap;gap:4mm}.l{width:60mm;border:1px solid #999;padding:3mm;font-size:10pt}.b{font-family:monospace;letter-spacing:2px;margin-top:2mm}</style></head><body><div class="g">${cells.join('')}</div></body></html>`;
}
/** Finds each code exactly (the web does the same search), then asks the server for the label data. */
export async function fetchLabels(
  c: ApiClient,
  lines: LabelLine[],
): Promise<{ labels: LabelView[] } | { missing: string }> {
  const parts: string[] = [];
  for (const ln of lines) {
    const f = await c.get<{ items: { id: string; code: string }[] }>('/products', {
      query: { q: ln.code, limit: 20 },
    });
    const p = f.items.find((x) => x.code.toLowerCase() === ln.code.toLowerCase());
    if (!p) return { missing: ln.code };
    parts.push(`${p.id}:${ln.copies}`);
  }
  return c.get<{ labels: LabelView[] }>('/labels', { query: { items: parts.join(',') } });
}

export function LabelSheet() {
  const { t, client, can } = useStk();
  const fail = useFailureText();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  if (!can('product.view')) return null;
  if (!open) return <Btn kind="ghost" label={t('wp7.lab.open')} onPress={() => setOpen(true)} />;
  const parsed = parseLabelLines(text);
  return (
    <Card>
      <Text style={kit.name}>{t('wp7.lab.title')}</Text>
      <Text style={kit.sub}>{t('wp7.lab.hint')}</Text>
      <Area label={t('wp7.lab.lines')} value={text} onChange={setText} />
      {text.trim() !== '' && 'line' in parsed ? (
        <Text style={kit.sub}>{t('wp7.lab.bad', { line: parsed.line })}</Text>
      ) : null}
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <Btn
        label={t('wp7.lab.make')}
        disabled={busy || 'line' in parsed}
        onPress={() => {
          if ('line' in parsed) return;
          setBusy(true);
          setMsg(null);
          void fetchLabels(client!, parsed.lines)
            .then(async (r) => {
              if ('missing' in r)
                return setMsg({ tone: 'error', text: t('wp7.lab.missing', { code: r.missing }) });
              const { uri } = await Print.printToFileAsync({ html: labelsHtml(r.labels, t('wp7.lab.mrp')) });
              if (!(await Sharing.isAvailableAsync()))
                return setMsg({ tone: 'error', text: t('wp7.io.noSharing') });
              await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
              setMsg({ tone: 'ok', text: t('wp7.lab.done') });
            })
            .catch((e: unknown) => setMsg({ tone: 'error', text: fail(e) }))
            .finally(() => setBusy(false));
        }}
      />
      <Btn kind="ghost" label={t('wp7.cancel')} onPress={() => setOpen(false)} />
    </Card>
  );
}
