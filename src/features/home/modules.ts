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
    ],
  },
  {
    id: 'reports',
    icon: '📊',
    color: '#0f766e',
    features: [{ key: 'reports', href: '/reports', icon: '📊' }],
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
    ],
  },
  {
    id: 'setup',
    icon: '⚙️',
    color: '#475569',
    features: [{ key: 'settings', href: '/settings', icon: '⚙️' }],
  },
  {
    id: 'account',
    icon: '👤',
    color: '#7c3aed',
    features: [{ key: 'account', href: '/account', icon: '👤' }],
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
