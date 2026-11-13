import type { ApiClient } from '@/api/client';
import { dec } from '@/money';
import { newId } from '@/device';
import { createCustomer } from '../customers/form-api';
import { postReceipt } from '../collections/api';
import type { Block } from './api';

// The hands of the AI assistant (same rules as apps/web/src/assistant-tools.js). The model only decides WHICH tool and with what;
// the call is made here with the signed-in person's own token, so the server's permission checks apply as on any screen.
// Whatever changes data is shown first (with the customer name read back from the API, not the model's claim) and runs only after a Yes.

const MAX_RESULT = 7000;
const MAX_ROWS = 25;
const UUID = /^[0-9a-f-]{36}$/i;
const MODES = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'BANK_TRANSFER'] as const;

/** Reads the model may do: these areas only, never documents, printouts, photos, shares or file contents. */
const READ_OK =
  /^\/(reports|sales|inventory|alerts|customers|products|complaints|crm|receipts|procurement|branches|warehouses|users|credit|collections|catalogue|settings|agri|ai|me)(\/|\?|$)/;
const READ_NO = /(\/print|\/content|\/photos|\/documents|\/access-log|\/share|\.\.|\/\/|:|\\|#)/;

/** Screens the model may open, by the names the server's prompt lists, mapped to app routes. */
export const SCREENS: Record<string, string> = {
  home: '/',
  sales: '/pos',
  products: '/products',
  inventory: '/stock',
  purchase: '/purchase',
  customers: '/customers',
  collections: '/collections',
  complaints: '/complaints',
  'audit-log': '/audit',
  settings: '/settings',
  account: '/account',
  users: '/users',
  roles: '/roles',
  security: '/security',
};

/** Keeps a tool answer small enough for the model: long lists are cut and the cut is said. */
export function shrink(data: unknown): string {
  const cut = (v: unknown) =>
    Array.isArray(v) && v.length > MAX_ROWS
      ? [...v.slice(0, MAX_ROWS), { note: `${v.length - MAX_ROWS} more rows not shown` }]
      : v;
  const d =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, cut(v)]))
      : cut(data);
  const s = JSON.stringify(d ?? null);
  return s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)} ...(cut: ask a narrower question)` : s;
}

/** A rupee amount from the model as a decimal string, or null when it is not a real amount (more than 0, at most 2 places, under 10 crore). */
export function rupees(x: unknown): string | null {
  if (typeof x !== 'number' && typeof x !== 'string') return null;
  try {
    const d = dec(String(x).trim());
    if (!d.isFinite() || d.lte(0) || d.gt(100_000_000) || d.decimalPlaces() > 2) return null;
    return d.toFixed(2);
  } catch {
    return null;
  }
}

export interface ToolCtx {
  client: ApiClient;
  can: (permission: string) => boolean;
  /** Shows a Yes/No card; resolves true on Yes. */
  confirm: (title: string, rows: [string, string][]) => Promise<boolean>;
  go: (route: string) => void;
  openCustomer: (id: string) => void;
  setLang: (code: 'en' | 'hi' | 'mr') => void;
  signOut: () => void;
  /** Today in India time, YYYY-MM-DD. */
  today: () => string;
}

type Tool = (input: Record<string, unknown>) => Promise<string>;

export function makeTools(ctx: ToolCtx): Record<string, Tool> {
  const customer = async (id: unknown) => {
    if (typeof id !== 'string' || !UUID.test(id))
      throw new Error('customerId is not a valid id; look the customer up first');
    return ctx.client.get<{ id: string; name: string; mobile?: string }>(`/customers/${id}`);
  };
  return {
    async get({ path }) {
      const p = String(path ?? '');
      if (!p.startsWith('/') || !READ_OK.test(p) || READ_NO.test(p))
        throw new Error('that path cannot be read by the assistant');
      return shrink(await ctx.client.get(p));
    },
    async navigate({ screen }) {
      const r = SCREENS[String(screen)];
      if (!r) return `The app does not have a "${String(screen)}" screen.`;
      ctx.go(r);
      return `Opened ${String(screen)}.`;
    },
    async open_customer({ customerId }) {
      const c = await customer(customerId);
      ctx.openCustomer(c.id);
      return `Opened ${c.name}.`;
    },
    async add_customer({ name, mobile, village, gstin }) {
      if (!ctx.can('customer.create')) return 'Refused: this role cannot add customers.';
      if (typeof name !== 'string' || name.trim().length < 2 || !/^[6-9]\d{9}$/.test(String(mobile ?? '')))
        return 'Not done: a name and a 10-digit mobile starting 6-9 are needed.';
      const rows: [string, string][] = [
        ['Name', name.trim()],
        ['Mobile', String(mobile)],
      ];
      if (village) rows.push(['Village', String(village)]);
      if (gstin) rows.push(['GSTIN', String(gstin)]);
      if (!(await ctx.confirm(`Add customer ${name.trim()}?`, rows)))
        return 'The person said no. Nothing was changed.';
      const body: Record<string, unknown> = { name: name.trim(), mobile: String(mobile) };
      if (village) body.village = String(village);
      if (gstin) body.gstin = String(gstin);
      const made = await createCustomer(ctx.client, body, newId());
      return `Customer created${made?.id ? ` (id ${made.id})` : ''}.`;
    },
    async record_payment({ customerId, amount, mode, reference }) {
      if (!ctx.can('receipt.create')) return 'Refused: this role cannot record payments.';
      const amt = rupees(amount);
      if (!amt) return 'Not done: the amount must be more than 0, with at most 2 decimals.';
      if (!MODES.includes(mode as (typeof MODES)[number]))
        return `Not done: the payment mode must be one of ${MODES.join(', ')}.`;
      const c = await customer(customerId);
      const rows: [string, string][] = [
        ['Customer', `${c.name}${c.mobile ? ` (${c.mobile})` : ''}`],
        ['Amount', `₹${amt}`],
        ['Mode', String(mode)],
      ];
      if (reference) rows.push(['Reference', String(reference)]);
      if (!(await ctx.confirm(`Record ₹${amt} ${String(mode)} from ${c.name}?`, rows)))
        return 'The person said no. Nothing was changed.';
      const branches = (
        await ctx.client.get<{ items: { id: string; status?: string }[] }>('/branches')
      ).items.filter((b) => b.status === undefined || b.status === 'ACTIVE');
      if (!branches[0]) throw new Error('there is no active branch to record the payment against');
      await postReceipt(
        ctx.client,
        {
          customerId: c.id,
          branchId: branches[0].id,
          modeCode: String(mode),
          amount: amt,
          receiptDate: ctx.today(),
          ...(reference ? { reference: String(reference) } : {}),
        },
        newId(),
      );
      return `Receipt of ₹${amt} recorded for ${c.name}; it was applied to the oldest dues first.`;
    },
    async set_theme() {
      return 'Not available: the app has one theme.';
    },
    async toggle_header() {
      return 'Not available: the app has no top menu bar to hide.';
    },
    async set_language({ code }) {
      if (code !== 'en' && code !== 'hi' && code !== 'mr')
        return 'The app has English (en), Hindi (hi) and Marathi (mr) only.';
      ctx.setLang(code);
      return `Switching the screens to "${code}".`;
    },
    async sign_out() {
      if (!(await ctx.confirm('Sign out now?', []))) return 'The person said no. Staying signed in.';
      ctx.signOut();
      return 'Signing out.';
    },
  };
}

/**
 * Runs the tool calls of one model answer, and returns the `tool_result` blocks to send back. A tool that throws is reported to the
 * model as an error result so it can explain or retry; an unknown tool name is an error too.
 */
export async function runToolUses(tools: Record<string, Tool>, content: Block[]): Promise<Block[]> {
  const out: Block[] = [];
  for (const u of content.filter((b) => b.type === 'tool_use')) {
    const run = Object.prototype.hasOwnProperty.call(tools, String(u.name))
      ? tools[String(u.name)]
      : undefined;
    try {
      if (!run) throw new Error(`unknown tool ${String(u.name)}`);
      out.push({
        type: 'tool_result',
        tool_use_id: u.id,
        content: String(await run((u.input ?? {}) as Record<string, unknown>)),
      });
    } catch (e) {
      out.push({
        type: 'tool_result',
        tool_use_id: u.id,
        content: `Error: ${e instanceof Error ? e.message : 'failed'}`,
        is_error: true,
      });
    }
  }
  return out;
}
