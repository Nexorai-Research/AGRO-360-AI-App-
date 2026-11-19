import type { Row, RowAction, TabDef } from './cmp-api';
import * as F from './cmp-forms';

const act = (a: RowAction): RowAction => a;
const id = (r: Row) => String(r.id);

const snapshots: TabDef = {
  id: 'snapshots',
  perm: 'compliance.gst.view',
  path: '/gst/snapshots',
  query: 'none',
  title: [{ k: 'returnType' }, { k: 'period' }],
  fields: [{ k: 'version' }, { k: 'createdAt', kind: 'date' }, { k: 'checksum' }],
};
const blocks: TabDef = {
  id: 'blocks',
  perm: 'compliance.gst.view',
  path: '/gst/itc-blocks',
  query: 'none',
  title: [{ k: 'name' }],
  fields: [{ k: 'kind', kind: 'status' }, { k: 'reason' }],
  actions: [
    act({
      id: 'removeBlock',
      perm: 'compliance.itc.manage',
      path: (r) => `/gst/itc-blocks/${id(r)}/remove`,
      confirm: true,
    }),
  ],
};
const rcm: TabDef = {
  id: 'rcm',
  perm: 'compliance.gst.view',
  path: '/rcm/entries',
  query: 'none',
  title: [{ k: 'selfInvoiceNo' }, { k: 'supplierName' }],
  fields: [
    { k: 'entryDate', kind: 'date' },
    { k: 'taxable', kind: 'money' },
    { k: 'igst', kind: 'money' },
    { k: 'cgst', kind: 'money' },
    { k: 'sgst', kind: 'money' },
    { k: 'itcClaimable', kind: 'bool' },
    { k: 'status', kind: 'status' },
  ],
  actions: [
    act({
      id: 'reverseEntry',
      perm: 'compliance.rcm.manage',
      path: (r) => `/rcm/entries/${id(r)}/reverse`,
      confirm: true,
      show: (r) => r.status === 'POSTED',
    }),
  ],
};
const tdsSections: TabDef = {
  id: 'tdsSections',
  perm: 'compliance.gst.view',
  path: '/tax/tds-config',
  query: 'none',
  title: [{ k: 'code' }, { k: 'name' }],
  fields: [
    { k: 'kind', kind: 'status' },
    { k: 'ratePct' },
    { k: 'ratePctNoPan' },
    { k: 'annualThreshold', kind: 'money' },
    { k: 'effectiveFrom', kind: 'date' },
  ],
};
const tdsReport: TabDef = {
  id: 'tdsReport',
  perm: 'compliance.gst.view',
  path: '/reports/tds',
  query: 'range',
  itemsKey: 'rows',
  total: 'total',
  title: [{ k: 'section' }, { k: 'partyName' }],
  fields: [
    { k: 'documents' },
    { k: 'base', kind: 'money' },
    { k: 'deductOn', kind: 'money' },
    { k: 'amount', kind: 'money' },
    { k: 'panMissing', kind: 'bool' },
  ],
};

const register = (tid: string, path: string): TabDef => ({
  id: tid,
  perm: 'compliance.registers.view',
  path,
  query: 'period',
  itemsKey: 'rows',
  title: [{ k: 'skuCode' }, { k: 'batchNo' }],
  fields: [
    { k: 'opening', kind: 'qty' },
    { k: 'receipts', kind: 'qty' },
    { k: 'sales', kind: 'qty' },
    { k: 'other', kind: 'qty' },
    { k: 'closing', kind: 'qty' },
    { k: 'missing' },
  ],
});
const seedLots: TabDef = {
  id: 'seedLots',
  perm: 'compliance.registers.view',
  path: '/compliance/seed-lots',
  query: 'none',
  create: [F.seedLotForm],
  title: [{ k: 'skuCode' }, { k: 'batchNo' }],
  fields: [
    { k: 'variety' },
    { k: 'producer' },
    { k: 'germinationPct' },
    { k: 'testDate', kind: 'date' },
    { k: 'validTo', kind: 'date' },
  ],
};

const restricted: TabDef = {
  id: 'restricted',
  perm: 'compliance.registers.view',
  path: '/compliance/restricted-ingredients',
  query: 'none',
  create: [F.restrictionForm],
  title: [{ k: 'name' }],
  fields: [
    { k: 'scope', kind: 'status' },
    { k: 'restriction', kind: 'status' },
    { k: 'reference' },
    { k: 'effectiveFrom', kind: 'date' },
    { k: 'status', kind: 'status' },
  ],
  actions: [
    act({
      id: 'withdraw',
      perm: 'compliance.restricted.manage',
      path: (r) => `/compliance/restricted-ingredients/${id(r)}/withdraw`,
      reason: true,
      show: (r) => r.status === 'ACTIVE',
    }),
  ],
};
const registrations: TabDef = {
  id: 'registrations',
  perm: 'compliance.registers.view',
  path: '/compliance/registrations',
  query: 'none',
  create: [F.registrationForm],
  title: [{ k: 'skuCode' }, { k: 'regNumber' }],
  fields: [
    { k: 'validTo', kind: 'date' },
    { k: 'status', kind: 'status' },
  ],
  actions: [
    act({
      id: 'suspend',
      perm: 'compliance.registration.manage',
      path: (r) => `/compliance/registrations/${id(r)}/suspend`,
      reason: true,
      versioned: true,
      show: (r) => r.status !== 'SUSPENDED',
    }),
    act({
      id: 'restore',
      perm: 'compliance.registration.manage',
      path: (r) => `/compliance/registrations/${id(r)}/restore`,
      versioned: true,
      show: (r) => r.status === 'SUSPENDED',
    }),
  ],
};
const authorisations: TabDef = {
  id: 'authorisations',
  perm: 'compliance.authorisation.manage',
  path: '/compliance/authorisations',
  query: 'none',
  create: [F.authorisationForm],
  title: [{ k: 'manufacturerName' }, { k: 'brandName' }],
  fields: [
    { k: 'scopeNote' },
    { k: 'territory' },
    { k: 'validTo', kind: 'date' },
    { k: 'status', kind: 'status' },
  ],
  actions: [
    act({
      id: 'revoke',
      perm: 'compliance.authorisation.manage',
      path: (r) => `/compliance/authorisations/${id(r)}/revoke`,
      reason: true,
      show: (r) => r.status === 'ACTIVE',
    }),
  ],
};
const documents: TabDef = {
  id: 'documents',
  perm: 'compliance.vault.view',
  path: '/compliance/documents',
  query: 'none',
  create: [F.documentForm, F.auditPackForm],
  title: [{ k: 'title' }],
  fields: [
    { k: 'docType', kind: 'status' },
    { k: 'docNumber' },
    { k: 'validTo', kind: 'date' },
    { k: 'expiry', kind: 'status' },
    { k: 'fileRef' },
  ],
};
const alerts: TabDef = {
  id: 'alerts',
  perm: 'compliance.vault.view',
  path: '/compliance/alerts',
  query: 'openOnly',
  create: [F.alertsRunForm],
  title: [{ k: 'title' }],
  fields: [{ k: 'dueDate', kind: 'date' }, { k: 'leadDays' }],
  actions: [
    act({
      id: 'acknowledge',
      perm: 'compliance.docs.manage',
      path: (r) => `/compliance/alerts/${id(r)}/acknowledge`,
      show: (r) => !r.acknowledgedAt,
    }),
  ],
};
const tasks: TabDef = {
  id: 'tasks',
  perm: 'compliance.vault.view',
  path: '/compliance/renewal-tasks',
  query: 'none',
  title: [{ k: 'title' }],
  fields: [
    { k: 'dueDate', kind: 'date' },
    { k: 'status', kind: 'status' },
  ],
  actions: [
    act({
      id: 'complete',
      perm: 'compliance.docs.manage',
      path: (r) => `/compliance/renewal-tasks/${id(r)}/complete`,
      show: (r) => r.status === 'OPEN',
    }),
  ],
};

const recalls: TabDef = {
  id: 'recalls',
  perm: 'compliance.recall.manage',
  path: '/compliance/recalls',
  query: 'none',
  create: [F.recallForm],
  actions: F.recallActions,
  title: [{ k: 'caseNo' }, { k: 'title' }],
  fields: [
    { k: 'source', kind: 'status' },
    { k: 'severity', kind: 'status' },
    { k: 'metrics.found' },
    { k: 'metrics.quarantinedUnits' },
    { k: 'metrics.returned' },
    { k: 'metrics.unresolved' },
    { k: 'status', kind: 'status' },
  ],
};
const quarantine: TabDef = {
  id: 'quarantine',
  perm: 'compliance.quarantine.manage',
  path: '/compliance/quarantine',
  query: 'none',
  create: [F.quarantineForm],
  actions: F.quarantineActions,
  title: [{ k: 'caseNo' }, { k: 'skuCode' }],
  fields: [
    { k: 'batchNo' },
    { k: 'reasonCode', kind: 'status' },
    { k: 'reason' },
    { k: 'status', kind: 'status' },
  ],
};
const cases: TabDef = {
  id: 'cases',
  perm: 'compliance.case.manage',
  path: '/compliance/cases',
  query: 'none',
  create: [F.caseForm],
  actions: F.caseActions,
  title: [{ k: 'caseNo' }],
  fields: [
    { k: 'kind', kind: 'status' },
    { k: 'description' },
    { k: 'severity', kind: 'status' },
    { k: 'status', kind: 'status' },
  ],
};
const incidents: TabDef = {
  id: 'incidents',
  perm: 'compliance.incident.view',
  path: '/compliance/incidents',
  query: 'none',
  create: [F.incidentForm],
  title: [{ k: 'incidentNo' }],
  fields: [
    { k: 'incidentType', kind: 'status' },
    { k: 'occurredOn', kind: 'date' },
    { k: 'peopleAffected' },
    { k: 'severity', kind: 'status' },
    { k: 'status', kind: 'status' },
  ],
};
const samples: TabDef = {
  id: 'samples',
  perm: 'compliance.sample.manage',
  path: '/compliance/samples',
  query: 'none',
  create: [F.sampleForm],
  actions: F.sampleActions,
  title: [{ k: 'sampleNo' }, { k: 'skuCode' }],
  fields: [
    { k: 'batchNo' },
    { k: 'qty', kind: 'qty' },
    { k: 'purpose', kind: 'status' },
    { k: 'takenOn', kind: 'date' },
    { k: 'status', kind: 'status' },
  ],
};
const authenticity: TabDef = {
  id: 'authenticity',
  perm: 'compliance.authenticity.manage',
  path: '/compliance/authenticity-checks',
  query: 'none',
  create: [F.authenticityForm],
  title: [{ k: 'skuCode' }, { k: 'codeText' }],
  fields: [
    { k: 'checkedAt', kind: 'date' },
    { k: 'context', kind: 'status' },
    { k: 'outcome', kind: 'status' },
  ],
};
const evaluations: TabDef = {
  id: 'evaluations',
  perm: 'compliance.evaluation.view',
  path: '/compliance/evaluations',
  query: 'range',
  title: [{ k: 'onDate', kind: 'date' }, { k: 'subject' }],
  fields: [{ k: 'outcome', kind: 'status' }, { k: 'overriddenBy' }, { k: 'overrideReason' }],
};
const rules: TabDef = {
  id: 'rules',
  perm: 'compliance.evaluation.view',
  path: '/compliance/rules',
  query: 'none',
  create: [F.ruleForm],
  rows: F.ruleRows,
  actions: F.ruleActions,
  title: [{ k: 'code' }, { k: 'name' }],
  fields: [
    { k: 'version' },
    { k: 'outcome', kind: 'status' },
    { k: 'effectiveFrom', kind: 'date' },
    { k: 'status', kind: 'status' },
  ],
};

// ---- web parity 3.4 / 3.6 (apps/web/src/pages/compliance.js itcTab, rcm rules) ----
const itcRecon: TabDef = {
  id: 'itcRecon',
  perm: 'compliance.gst.view',
  path: '/gst/itc-reconciliation',
  query: 'period',
  itemsKey: 'rows',
  title: [{ k: 'supplierGstin' }, { k: 'invoiceNo' }],
  fields: [
    { k: 'status', kind: 'status' },
    { k: 'bookTax', kind: 'money' },
    { k: 'portalTax', kind: 'money' },
    { k: 'difference', kind: 'money' },
    { k: 'note' },
  ],
};
const rcmRules: TabDef = {
  id: 'rcmRules',
  perm: 'compliance.gst.view',
  path: '/rcm/rules',
  query: 'none',
  title: [{ k: 'name' }],
  fields: [{ k: 'appliesTo', kind: 'status' }, { k: 'refName' }, { k: 'active', kind: 'bool' }],
  actions: [
    act({
      id: 'switchOff',
      perm: 'compliance.rcm.manage',
      method: 'patch',
      path: (r) => `/rcm/rules/${id(r)}`,
      body: () => ({ active: false }),
      confirm: true,
      show: (r) => r.active === true,
    }),
    act({
      id: 'switchOn',
      perm: 'compliance.rcm.manage',
      method: 'patch',
      path: (r) => `/rcm/rules/${id(r)}`,
      body: () => ({ active: true }),
      confirm: true,
      show: (r) => r.active !== true,
    }),
  ],
};

// ---- web parity 6.1 (apps/web/src/pages/compliance.js itcTab: decide one bill) ----
const decide = (tid: string, decision: 'CLAIM' | 'BLOCK'): RowAction =>
  act({
    id: tid,
    perm: 'compliance.itc.manage',
    path: (r) => `/gst/bills/${String(r.billId)}/itc-decision`,
    body: () => ({ decision }),
    reason: true,
  });
const itcRegister: TabDef = {
  id: 'itcRegister',
  perm: 'compliance.gst.view',
  path: '/gst/itc-register',
  query: 'period',
  itemsKey: 'rows',
  title: [{ k: 'number' }, { k: 'supplierName' }],
  fields: [
    { k: 'supplierInvoiceNo' },
    { k: 'tax', kind: 'money' },
    { k: 'status', kind: 'status' },
    { k: 'reason' },
  ],
  actions: [decide('claimItc', 'CLAIM'), decide('blockItc', 'BLOCK')],
};

// ---- web parity 8 (apps/web/src/pages/compliance-agri.js restrictedTab "Affected stock", templatesTab, traceTab) ----
const impact: TabDef = {
  id: 'impact',
  perm: 'compliance.registers.view',
  path: '/compliance/restricted-ingredients/impact',
  query: 'none',
  itemsKey: 'products',
  title: [{ k: 'skuCode' }, { k: 'skuName' }],
  fields: [
    { k: 'ingredient' },
    { k: 'restriction', kind: 'status' },
    { k: 'reference' },
    { k: 'effectiveFrom', kind: 'date' },
  ],
};
const templates: TabDef = {
  id: 'templates',
  perm: 'compliance.reports.manage',
  path: '/compliance/report-templates',
  query: 'none',
  title: [{ k: 'code' }, { k: 'name' }],
  fields: [{ k: 'sourceKey', kind: 'status' }, { k: 'version' }, { k: 'status', kind: 'status' }],
  create: [F.templateForm],
  rows: F.templateRows,
  actions: F.templateActions,
};
const trace: TabDef = {
  id: 'trace',
  perm: 'compliance.trace.view',
  path: '/compliance/trace',
  query: 'none',
  title: [],
  fields: [],
  view: 'trace',
};

export interface HubDef {
  titleKey: string;
  tabs: TabDef[];
}
export const HUBS: Record<string, HubDef> = {
  taxRecords: {
    titleKey: 'taxRecords',
    tabs: [rcm, rcmRules, itcRegister, itcRecon, blocks, tdsReport, tdsSections, snapshots],
  },
  agriRegisters: {
    titleKey: 'agriRegisters',
    tabs: [
      register('pesticide', '/compliance/pesticide-register'),
      register('fertilizer', '/compliance/fertilizer-register'),
      register('seed', '/compliance/seed-register'),
      seedLots,
    ],
  },
  licences: {
    titleKey: 'licences',
    tabs: [registrations, authorisations, documents, alerts, tasks, restricted, impact, templates],
  },
  safety: {
    titleKey: 'safety',
    tabs: [recalls, trace, quarantine, cases, incidents, samples, authenticity, evaluations, rules],
  },
};
