// Pure helpers for the admin screens. No network, no React.

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** The server needs a reason of 10 to 500 characters to deactivate a user (recorded in the audit trail). */
export const validReason = (v: string, min = REASON_MIN) => v.trim().length >= min && v.trim().length <= REASON_MAX;

/** Shows only the last 4 characters of an account number: "XXXX1234". Short values are fully hidden. */
export function maskTail(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.replace(/\s+/g, '');
  return s.length <= 4 ? 'XXXX' : `XXXX${s.slice(-4)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function nextDay(v: string): string {
  const d = new Date(`${v}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The franchise day in India time. `from` is the start of that day; `to` is the start of the NEXT day, because the API's `to` is exclusive. */
export function auditRange(from: string, to: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (from) out.from = `${from}T00:00:00+05:30`;
  if (to) out.to = `${nextDay(to)}T00:00:00+05:30`;
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validActor = (v: string) => v === '' || UUID_RE.test(v);
export const validAction = (v: string) => v === '' || /^[a-z][a-z0-9_.]{1,80}$/.test(v);
export const validEntity = (v: string) => v === '' || /^[A-Za-z][A-Za-z0-9_.]{1,60}$/.test(v);

export const shortId = (id: string | null) => (id ? id.slice(0, 8) : '');

export function formatBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** An ISO instant shown as dd/mm/yyyy hh:mm in India time. */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '-';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '-';
  const ist = new Date(t.getTime() + 330 * 60_000).toISOString();
  return `${ist.slice(8, 10)}/${ist.slice(5, 7)}/${ist.slice(0, 4)} ${ist.slice(11, 16)}`;
}
