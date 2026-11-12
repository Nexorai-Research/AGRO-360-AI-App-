import { dec } from '@/money';
import { validDay } from './kit';

export interface OpeningLine {
  skuCode: string;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  qty: string;
  unitCost: string;
}
export type CsvError = 'header' | 'empty' | 'row';

const decOk = (v: string, places: number) => new RegExp(`^\\d{1,12}(\\.\\d{1,${places}})?$`).test(v);

/** Opening stock CSV: header skuCode,batchNo,mfgDate,expiryDate,qty,unitCost. Every value stays text. */
export function parseOpeningCsv(text: string): { lines: OpeningLine[] } | { error: CsvError; row?: number } {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const head = rows
    .shift()
    ?.split(',')
    .map((x) => x.trim());
  if (!head || !head.includes('skuCode') || !head.includes('qty') || !head.includes('unitCost'))
    return { error: 'header' };
  if (rows.length === 0) return { error: 'empty' };
  const lines: OpeningLine[] = [];
  for (const [i, r] of rows.entries()) {
    const c = r.split(',').map((x) => x.trim());
    const o: Record<string, string> = {};
    head.forEach((k, j) => {
      if (c[j]) o[k] = c[j]!;
    });
    if (
      !o.skuCode ||
      !o.qty ||
      !o.unitCost ||
      !decOk(o.qty, 6) ||
      !decOk(o.unitCost, 4) ||
      (o.expiryDate && !validDay(o.expiryDate)) ||
      (o.mfgDate && !validDay(o.mfgDate))
    )
      return { error: 'row', row: i + 2 };
    lines.push(o as unknown as OpeningLine);
  }
  return { lines };
}

export type RuleError = 'format' | 'order';
/** Minimum <= reorder level <= maximum, all decimal text. */
export function checkRule(r: {
  minQty: string;
  reorderLevel: string;
  maxQty: string;
  reorderQty: string;
}): RuleError | null {
  for (const v of [r.minQty, r.reorderLevel, r.maxQty, r.reorderQty])
    if (!decOk(v.trim(), 6)) return 'format';
  return dec(r.minQty).lte(r.reorderLevel) && dec(r.reorderLevel).lte(r.maxQty) ? null : 'order';
}
