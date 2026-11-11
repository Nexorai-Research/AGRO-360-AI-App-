// Shapes copied from the backend (modules/customer, credit, finance, sales). Money and quantities are strings, never numbers.

export interface CustomerSummary {
  id: string;
  code: string;
  name: string;
  /** Shown exactly as the API sends it. */
  mobile: string | null;
  village: string | null;
  categoryName: string | null;
  status: string;
  creditHold: boolean;
}

export interface CustomerProfile extends Omit<CustomerSummary, 'creditHold'> {
  altMobile: string | null;
  sharedMobile: boolean;
  taluka: string | null;
  district: string | null;
  language: string;
  gstin: string | null;
  version: number;
}

export interface CreditAccount {
  customerId: string;
  creditLimit: string;
  seasonLimit: string | null;
  hold: boolean;
  holdReason: string | null;
  outstanding: string;
  available: string;
}

/** One invoice line, as customerPurchases() returns it (snake_case columns). */
export interface PurchaseLine {
  invoice_id: string;
  number: string;
  d: string;
  status: string;
  sku_code: string;
  sku_name: string;
  qty: string;
  unit_price: string;
  line_total: string;
  batch_no: string | null;
  returned: string;
}

export interface SeasonSummary {
  season: string;
  year: number;
  invoices: number;
  amount: string;
}

export interface Customer360 {
  profile: CustomerProfile;
  /** null when the caller lacks customer.ledger.view. */
  credit: CreditAccount | null;
  purchases: { thisSeason: SeasonSummary; lastSeason: SeasonSummary };
  recentPurchases: PurchaseLine[];
}

export interface LedgerEntry {
  journalId: string;
  date: string;
  sourceType: string;
  purpose: string;
  debit: string;
  credit: string;
  balance: string;
}

export interface CustomerLedger {
  opening: string;
  entries: LedgerEntry[];
  closing: string;
}
