/**
 * The same groups as the web menu (apps/web main.js): each module holds the app screens that belong to it.
 * The app only organises and hides; the server still decides what a user may open (a denied screen shows its own message).
 */
export interface Feature {
  /** Key of `nav.<key>` (title) and `featureDesc.<key>` (one line). */
  key: string;
  href: string;
  icon: string;
}

export interface AppModule {
  id: string;
  icon: string;
  /** Strong colour of the module; soft tints are made from it. */
  color: string;
  features: Feature[];
}

export const MODULES: AppModule[] = [
  {
    id: 'ops',
    icon: '📦',
    color: '#15803d',
    features: [
      { key: 'pos', href: '/pos', icon: '🧾' },
      { key: 'invoices', href: '/invoices', icon: '📄' },
      { key: 'shifts', href: '/shifts', icon: '⏱️' },
      { key: 'products', href: '/products', icon: '🏷️' },
      { key: 'stock', href: '/stock', icon: '📦' },
      { key: 'adjustments', href: '/adjustments', icon: '⚖️' },
      { key: 'transfers', href: '/transfers', icon: '🚚' },
      { key: 'batches', href: '/batches', icon: '🧪' },
      { key: 'stockReports', href: '/stock-reports', icon: '📈' },
      { key: 'purchase', href: '/purchase', icon: '🛒' },
      { key: 'purchaseMoney', href: '/purchase-money', icon: '💸' },
      { key: 'cheques', href: '/cheques', icon: '🧾' },
      { key: 'creditInterest', href: '/credit-interest', icon: '📈' },
      { key: 'creditReminders', href: '/credit-reminders', icon: '🔔' },
      { key: 'creditSettings', href: '/credit-settings', icon: '⚙️' },
      { key: 'safety', href: '/recalls-safety', icon: '⚠️' },
      { key: 'stkCounts', href: '/inventory-counts', icon: '🧮' },
      { key: 'stkLedger', href: '/inventory-ledger', icon: '📒' },
      { key: 'stkOpening', href: '/inventory-opening', icon: '📥' },
      { key: 'stkExpiry', href: '/inventory-expiry', icon: '⏳' },
      { key: 'stkReorder', href: '/inventory-reorder', icon: '🔔' },
      { key: 'stkWriteOff', href: '/inventory-write-off', icon: '🗑️' },
      { key: 'stkSup', href: '/purchase-suppliers', icon: '🏭' },
      { key: 'stkGrn', href: '/purchase-receipts', icon: '📦' },
      { key: 'stkBill', href: '/purchase-bills', icon: '🧾' },
      { key: 'stkPay', href: '/pay-supplier', icon: '💸' },
    ],
  },
  {
    id: 'customers',
    icon: '🌾',
    color: '#0369a1',
    features: [
      { key: 'customers', href: '/customers', icon: '👨‍🌾' },
      { key: 'collections', href: '/collections', icon: '💰' },
      { key: 'followup', href: '/collections/follow-up', icon: '📞' },
      { key: 'complaints', href: '/complaints', icon: '💬' },
      { key: 'credit', href: '/customer-credit', icon: '💳' },
      { key: 'desk', href: '/collections/desk', icon: '📞' },
      { key: 'crmTools', href: '/crm/tools', icon: '🧰' },
      { key: 'crmVillages', href: '/crm/villages', icon: '🗺️' },
      { key: 'crmEngagement', href: '/crm/engagement', icon: '💬' },
      { key: 'complaintInsights', href: '/complaints/insights', icon: '📊' },
    ],
  },
  {
    id: 'accounts',
    icon: '💳',
    color: '#be123c',
    features: [
      { key: 'accounts', href: '/accounts', icon: '📒' },
      { key: 'statements', href: '/statements', icon: '📑' },
      { key: 'compliance', href: '/compliance', icon: '✅' },
      { key: 'receipts', href: '/receipts', icon: '💵' },
      { key: 'taxRecords', href: '/tax-records', icon: '🧮' },
      { key: 'finVouchers', href: '/finance-vouchers', icon: '🧾' },
      { key: 'finChart', href: '/finance-chart', icon: '📒' },
      { key: 'finExpenses', href: '/finance-expenses', icon: '💸' },
      { key: 'finBank', href: '/finance-bank', icon: '🏦' },
      { key: 'finPetty', href: '/finance-petty', icon: '👛' },
      { key: 'finControl', href: '/finance-control', icon: '🔒' },
      { key: 'finSettings', href: '/fin-settings', icon: '⚙️' },
      { key: 'finOpening', href: '/fin-opening', icon: '🚪' },
      { key: 'finYearEnd', href: '/fin-year-end', icon: '📆' },
      { key: 'finExport', href: '/fin-export', icon: '📤' },
      { key: 'finInter', href: '/fin-inter', icon: '🔁' },
      { key: 'finTemplates', href: '/fin-templates', icon: '🗓️' },
    ],
  },
  {
    id: 'reports',
    icon: '📊',
    color: '#0f766e',
    features: [
      { key: 'reports', href: '/reports', icon: '📊' },
      { key: 'reportsMore', href: '/reports-more', icon: '📑' },
      { key: 'gstr1', href: '/gstr1', icon: '🧾' },
      { key: 'agriRegisters', href: '/agri-registers', icon: '🌱' },
      { key: 'stkValuation', href: '/inventory-valuation', icon: '💰' },
      { key: 'stkRep', href: '/purchase-reports', icon: '📊' },
    ],
  },
  {
    id: 'staff',
    icon: '👥',
    color: '#c2410c',
    features: [
      { key: 'attendance', href: '/attendance', icon: '📍' },
      { key: 'leave', href: '/leave', icon: '🏖️' },
      { key: 'payslips', href: '/payslips', icon: '💵' },
      { key: 'visits', href: '/visits', icon: '🗺️' },
      { key: 'advances', href: '/advances', icon: '🏦' },
      { key: 'staff', href: '/staff', icon: '👥' },
      { key: 'attendanceRegister', href: '/attendance-register', icon: '🗓️' },
      { key: 'payroll', href: '/payroll', icon: '🧮' },
      { key: 'salarySetup', href: '/salary-setup', icon: '💼' },
      { key: 'advanceDesk', href: '/advance-desk', icon: '🏧' },
      { key: 'fieldReview', href: '/field-review', icon: '🚜' },
      { key: 'incentives', href: '/incentives', icon: '🎯' },
    ],
  },
  {
    id: 'admin',
    icon: '🛡️',
    color: '#b45309',
    features: [
      { key: 'users', href: '/users', icon: '🧑‍💼' },
      { key: 'roles', href: '/roles', icon: '🔑' },
      { key: 'audit', href: '/audit', icon: '🔍' },
      { key: 'documents', href: '/documents', icon: '📁' },
      { key: 'security', href: '/security', icon: '🛡️' },
      { key: 'userSecurity', href: '/user-security', icon: '🔓' },
    ],
  },
  {
    id: 'setup',
    icon: '⚙️',
    color: '#475569',
    features: [
      { key: 'setupBranches', href: '/setup-branches', icon: '🏬' },
      { key: 'setupWarehouses', href: '/setup-warehouses', icon: '🏭' },
      { key: 'setupYears', href: '/setup-years', icon: '📅' },
      { key: 'setupTax', href: '/setup-tax', icon: '🧾' },
      { key: 'setupNumbering', href: '/setup-numbering', icon: '🔢' },
      { key: 'setupPrint', href: '/setup-print', icon: '🖨️' },
      { key: 'settings', href: '/settings', icon: '⚙️' },
      { key: 'importHistory', href: '/import-history', icon: '📥' },
      { key: 'configuration', href: '/configuration', icon: '🧩' },
      { key: 'settingsEdit', href: '/settings-edit', icon: '⚙️' },
      { key: 'licences', href: '/licences', icon: '📜' },
      { key: 'stkCat', href: '/catalogue-categories', icon: '🗂️' },
      { key: 'stkBrand', href: '/catalogue-brands', icon: '🏷️' },
      { key: 'stkUnits', href: '/catalogue-units', icon: '⚖️' },
      { key: 'stkPrice', href: '/price-lists', icon: '💲' },
      { key: 'stkHsn', href: '/catalogue-hsn', icon: '🧾' },
    ],
  },
  {
    id: 'account',
    icon: '👤',
    color: '#7c3aed',
    features: [
      { key: 'account', href: '/account', icon: '👤' },
      { key: 'devices', href: '/devices', icon: '📱' },
    ],
  },
];

export const findModule = (id: string | undefined) => MODULES.find((m) => m.id === id);

/** Where a tap on a module card goes: a module with one screen opens it directly (like the web menu), others open their feature list. */
export const moduleTarget = (m: AppModule): string => {
  const [only] = m.features;
  return only && m.features.length === 1 ? only.href : `/module/${m.id}`;
};

/** A soft background made from the module colour (hex + alpha). */
export const tint = (hex: string, alpha = '1A') => `${hex}${alpha}`;
