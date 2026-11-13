import { dec } from '@/money';

/** A budget in rupees: blank (then cash must limit it), or a decimal above 0 with at most 2 places, at most 100 crore. */
export function validBudget(v: string): boolean {
  const x = v.trim();
  if (x === '') return true;
  if (!/^\d+(\.\d{1,2})?$/.test(x)) return false;
  const d = dec(x);
  return d.gt(0) && d.lte(1_000_000_000);
}
/** A change of purchase prices in percent: blank (none) or a whole number or one decimal from -50 to 200. */
export function validPercent(v: string): boolean {
  const x = v.trim();
  if (x === '') return true;
  if (!/^-?\d+(\.\d)?$/.test(x)) return false;
  const d = dec(x);
  return d.gte(-50) && d.lte(200);
}
/** The body the server wants (it takes plain numbers for these two estimates; they are checked as decimals above first). */
export function budgetBody(budget: string, change: string, useCash: boolean) {
  const body: { budget?: number; useCash?: boolean; priceChangePct?: number } = {};
  if (budget.trim() !== '') body.budget = dec(budget.trim()).toNumber();
  if (change.trim() !== '') body.priceChangePct = dec(change.trim()).toNumber();
  if (useCash) body.useCash = true;
  return body;
}
