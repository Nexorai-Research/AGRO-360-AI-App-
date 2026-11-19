import {
  splitBatch,
  tn,
  tx,
  type FormDef,
  type FormField,
  type Row,
  type RowAction,
  type Values,
} from './cmp-api';

// Web parity phase 8: the add / run dialogs and the step dialogs of apps/web/src/pages/compliance-agri.js, field for field.
// The web form checks only "required"; everything else is decided by the server (modules/compliance/src/application/*).

const SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const C = (p: string) => `/compliance/${p}`;
const id = (r: Row) => String(r.id);
const f = (k: string, more: Omit<FormField, 'k'> = {}): FormField => ({ k, ...more });

// ---- registers and the licences hub ----------------------------------------------------------------------------------------------
export const seedLotForm: FormDef = {
  id: 'seedLot',
  perm: 'compliance.seed.manage',
  path: C('seed-lots'),
  fields: [
    f('batch', { kind: 'batch', required: true }),
    f('variety', { required: true }),
    f('producer'),
    f('lotNo'),
    f('germinationPct', { kind: 'num', required: true }),
    f('testDate', { kind: 'date', required: true }),
    f('validTo', { kind: 'date', required: true }),
  ],
  body: (v) => ({
    batchId: splitBatch(v.batch).batchId,
    variety: tx(v, 'variety'),
    producer: tn(v, 'producer'),
    lotNo: tn(v, 'lotNo'),
    germinationPct: tx(v, 'germinationPct'),
    testDate: tx(v, 'testDate'),
    validTo: tx(v, 'validTo'),
  }),
};
export const restrictionForm: FormDef = {
  id: 'restriction',
  perm: 'compliance.restricted.manage',
  path: C('restricted-ingredients'),
  fields: [
    f('ingredient', { required: true }),
    f('scope', {
      kind: 'select',
      options: ['LOCAL', 'GLOBAL'],
      optionPerm: { GLOBAL: 'compliance.restricted.global' },
    }),
    f('restriction', { kind: 'select', options: ['BANNED', 'RESTRICTED'] }),
    f('reference', { required: true }),
    f('reason'),
    f('effectiveFrom', { kind: 'date', required: true, init: 'today' }),
  ],
  body: (v) => ({
    name: tx(v, 'ingredient'),
    scope: v.scope,
    restriction: v.restriction,
    reference: tx(v, 'reference'),
    reason: tn(v, 'reason'),
    effectiveFrom: tx(v, 'effectiveFrom'),
  }),
};
export const registrationForm: FormDef = {
  id: 'registration',
  perm: 'compliance.registration.manage',
  path: C('registrations'),
  fields: [
    f('skuId', { kind: 'product', required: true }),
    f('regNumber', { required: true }),
    f('issuingAuthority'),
    f('validFrom', { kind: 'date', required: true }),
    f('validTo', { kind: 'date', required: true }),
    f('documentRef'),
  ],
  body: (v) => ({
    skuId: tx(v, 'skuId'),
    regNumber: tx(v, 'regNumber'),
    issuingAuthority: tn(v, 'issuingAuthority'),
    validFrom: tx(v, 'validFrom'),
    validTo: tx(v, 'validTo'),
    documentRef: tn(v, 'documentRef'),
  }),
};
export const authorisationForm: FormDef = {
  id: 'authorisation',
  perm: 'compliance.authorisation.manage',
  path: C('authorisations'),
  fields: [
    f('manufacturerId', { kind: 'manufacturer' }),
    f('brandId', { kind: 'brand' }),
    f('scopeNote'),
    f('territory'),
    f('validFrom', { kind: 'date', required: true }),
    f('validTo', { kind: 'date', required: true }),
    f('documentRef', { required: true }),
  ],
  body: (v) => ({
    manufacturerId: tn(v, 'manufacturerId'),
    brandId: tn(v, 'brandId'),
    scopeNote: tn(v, 'scopeNote'),
    territory: tn(v, 'territory'),
    validFrom: tx(v, 'validFrom'),
    validTo: tx(v, 'validTo'),
    documentRef: tx(v, 'documentRef'),
  }),
};
export const DOC_TYPES = [
  'LICENCE',
  'REGISTRATION',
  'AUTHORISATION',
  'SDS',
  'CERTIFICATE',
  'REGISTER',
  'RETURN',
  'INSPECTION',
  'OTHER',
];
export const documentForm: FormDef = {
  id: 'document',
  perm: 'compliance.docs.manage',
  path: C('documents'),
  fields: [
    f('docType', { kind: 'select', options: DOC_TYPES }),
    f('title', { required: true }),
    f('docNumber'),
    f('issuingAuthority'),
    f('validFrom', { kind: 'date' }),
    f('validTo', { kind: 'date' }),
    f('fileRef'),
  ],
  body: (v) => ({
    docType: v.docType,
    title: tx(v, 'title'),
    docNumber: tn(v, 'docNumber'),
    issuingAuthority: tn(v, 'issuingAuthority'),
    validFrom: tn(v, 'validFrom'),
    validTo: tn(v, 'validTo'),
    fileRef: tn(v, 'fileRef'),
  }),
};
export const alertsRunForm: FormDef = {
  id: 'alertsRun',
  perm: 'compliance.docs.manage',
  path: C('alerts/run'),
  fields: [],
  body: () => ({}),
};
export const auditPackForm: FormDef = {
  id: 'auditPack',
  perm: 'compliance.evidence.export',
  path: C('audit-pack'),
  fields: [f('period', { kind: 'month', required: true, init: 'month' })],
  body: (v) => ({ period: tx(v, 'period') }),
  file: true,
};
export const REPORT_SOURCES = [
  'pesticide_register',
  'fertilizer_register',
  'seed_register',
  'licence_status',
  'restricted_impact',
  'evaluation_log',
  'recall_summary',
  'hsn_summary',
];
export const templateForm: FormDef = {
  id: 'template',
  perm: 'compliance.reports.manage',
  path: C('report-templates'),
  fields: [
    f('code', { required: true }),
    f('name', { required: true }),
    f('jurisdiction', { required: true }),
    f('legalRef', { required: true }),
    f('sourceKey', { kind: 'select', options: REPORT_SOURCES }),
    f('columns', { required: true }),
    f('periodKind', { kind: 'select', options: ['MONTH', 'QUARTER', 'YEAR', 'ANY'] }),
  ],
  body: (v) => ({
    code: tx(v, 'code'),
    name: tx(v, 'name'),
    jurisdiction: tx(v, 'jurisdiction'),
    legalRef: tx(v, 'legalRef'),
    sourceKey: v.sourceKey,
    periodKind: v.periodKind,
    columns: tx(v, 'columns')
      .split(',')
      .map((k) => ({ key: k.trim() }))
      .filter((c) => c.key),
  }),
};

// ---- the safety hub --------------------------------------------------------------------------------------------------------------
const batchScope = (v: Values) => {
  const b = splitBatch(v.batch);
  return b.skuId ? { scope: [{ skuId: b.skuId, batchId: b.batchId }] } : {};
};
export const recallForm: FormDef = {
  id: 'recall',
  perm: 'compliance.recall.manage',
  path: C('recalls'),
  fields: [
    f('title', { required: true }),
    f('source', { kind: 'select', options: ['MANUFACTURER', 'REGULATOR', 'INTERNAL'] }),
    f('noticeRef'),
    f('reason', { kind: 'area', required: true }),
    f('severity', { kind: 'select', options: SEVERITY, init: 'MEDIUM' }),
    f('batch', { kind: 'batch' }),
  ],
  body: (v) => ({
    title: tx(v, 'title'),
    source: v.source,
    noticeRef: tn(v, 'noticeRef'),
    reason: tx(v, 'reason'),
    severity: v.severity,
    ...batchScope(v),
  }),
};
export const QUARANTINE_REASONS = [
  'CONTAMINATION',
  'SUSPECT',
  'RECALL',
  'AUTHENTICITY',
  'SAMPLE_FAIL',
  'RESTRICTED_INGREDIENT',
  'OTHER',
];
export const quarantineForm: FormDef = {
  id: 'quarantine',
  perm: 'compliance.quarantine.manage',
  path: C('quarantine'),
  fields: [
    f('batch', { kind: 'batch', required: true }),
    f('reasonCode', { kind: 'select', options: QUARANTINE_REASONS, init: 'SUSPECT' }),
    f('reason', { kind: 'area', required: true }),
  ],
  body: (v) => ({ batchId: splitBatch(v.batch).batchId, reasonCode: v.reasonCode, reason: tx(v, 'reason') }),
};
export const caseForm: FormDef = {
  id: 'case',
  perm: 'compliance.case.manage',
  path: C('cases'),
  fields: [
    f('kind', { kind: 'select', options: ['COMPLAINT', 'INCIDENT'] }),
    f('batch', { kind: 'batch' }),
    f('description', { kind: 'area', required: true }),
    f('severity', { kind: 'select', options: SEVERITY }),
  ],
  body: (v) => {
    const b = splitBatch(v.batch);
    return {
      kind: v.kind,
      skuId: b.skuId,
      batchId: b.batchId,
      description: tx(v, 'description'),
      severity: v.severity,
    };
  },
};
export const INCIDENT_TYPES = [
  'EXPOSURE',
  'POISONING',
  'SPILL',
  'FIRE',
  'CROP_DAMAGE',
  'ANIMAL_HARM',
  'STORAGE',
  'OTHER',
];
export const incidentForm: FormDef = {
  id: 'incident',
  perm: 'compliance.incident.report',
  path: C('incidents'),
  fields: [
    f('incidentType', { kind: 'select', options: INCIDENT_TYPES }),
    f('severity', { kind: 'select', options: SEVERITY }),
    f('batch', { kind: 'batch' }),
    f('location'),
    f('occurredOn', { kind: 'date', required: true, init: 'today' }),
    f('peopleAffected', { kind: 'num', init: '0' }),
    f('summary', { kind: 'area', required: true }),
  ],
  body: (v) => {
    const b = splitBatch(v.batch);
    return {
      type: v.incidentType,
      severity: v.severity,
      skuId: b.skuId,
      batchId: b.batchId,
      location: tn(v, 'location'),
      occurredOn: tx(v, 'occurredOn'),
      peopleAffected: Number(tx(v, 'peopleAffected') || 0),
      summary: tx(v, 'summary'),
    };
  },
};
export const sampleForm: FormDef = {
  id: 'sample',
  perm: 'compliance.sample.manage',
  path: C('samples'),
  fields: [
    f('batch', { kind: 'batch', required: true }),
    f('warehouseId', { kind: 'warehouse', required: true }),
    f('qty', { kind: 'num', required: true }),
    f('purpose', { kind: 'select', options: ['INTERNAL', 'AUTHORITY'] }),
    f('authority'),
    f('takenBy', { required: true }),
    f('takenOn', { kind: 'date', required: true, init: 'today' }),
  ],
  body: (v) => ({
    batchId: splitBatch(v.batch).batchId,
    warehouseId: tx(v, 'warehouseId'),
    qty: tx(v, 'qty'),
    purpose: v.purpose,
    authority: tn(v, 'authority'),
    takenBy: tx(v, 'takenBy'),
    takenOn: tx(v, 'takenOn'),
  }),
};
export const authenticityForm: FormDef = {
  id: 'authenticity',
  perm: 'compliance.authenticity.manage',
  path: C('authenticity-checks'),
  fields: [
    f('batch', { kind: 'batch', required: true }),
    f('codeText', { required: true }),
    f('context', { kind: 'select', options: ['RECEIPT', 'SALE', 'STOCK', 'OTHER'] }),
    f('outcome', { kind: 'select', options: ['VERIFIED', 'FAILED', 'UNVERIFIABLE'] }),
    f('note'),
  ],
  body: (v) => {
    const b = splitBatch(v.batch);
    return {
      skuId: b.skuId,
      batchId: b.batchId,
      code: tx(v, 'codeText'),
      context: v.context,
      outcome: v.outcome,
      note: tn(v, 'note'),
    };
  },
};
export const ruleForm: FormDef = {
  id: 'rule',
  perm: 'compliance.rules.manage',
  path: C('rules'),
  fields: [
    f('code', { required: true }),
    f('name', { required: true }),
    f('subject', { kind: 'select', options: ['SALE', 'PURCHASE', 'ORDER'] }),
    f('jurisdiction', { required: true }),
    f('legalSource', { required: true }),
    f('condition', { kind: 'area', required: true }),
    f('outcome', {
      kind: 'select',
      options: ['ALLOW', 'BLOCK', 'REQUIRE_APPROVAL', 'REQUIRE_DOCUMENT'],
      init: 'BLOCK',
    }),
    f('message', { required: true }),
    f('overridable', { kind: 'check' }),
    f('effectiveFrom', { kind: 'date', required: true, init: 'today' }),
  ],
  // like the web: the condition must be JSON
  check: (v) => {
    try {
      JSON.parse(tx(v, 'condition'));
      return null;
    } catch {
      return 'condition';
    }
  },
  body: (v) => ({
    code: tx(v, 'code'),
    name: tx(v, 'name'),
    subject: v.subject,
    jurisdiction: tx(v, 'jurisdiction'),
    legalSource: tx(v, 'legalSource'),
    condition: JSON.parse(tx(v, 'condition')) as unknown,
    outcome: v.outcome,
    message: tx(v, 'message'),
    overridable: v.overridable === true,
    effectiveFrom: tx(v, 'effectiveFrom'),
  }),
};

// ---- step actions on rows --------------------------------------------------------------------------------------------------------
const step = (
  aid: string,
  perm: string,
  path: (r: Row) => string,
  show: (r: Row) => boolean,
  more: Partial<RowAction> = {},
) => ({ id: aid, perm, path, show, confirm: true, ...more }) as RowAction;

export const recallActions: RowAction[] = [
  step(
    'recallQuarantine',
    'compliance.recall.manage',
    (r) => C(`recalls/${id(r)}/quarantine`),
    (r) => r.status !== 'CLOSED',
  ),
  step(
    'recallClose',
    'compliance.recall.manage',
    (r) => C(`recalls/${id(r)}/close`),
    (r) => r.status !== 'CLOSED',
    {
      confirm: false,
      fields: [f('note', { required: true })],
      formBody: (v) => ({ note: tx(v, 'note'), acceptUnresolved: true }),
    },
  ),
];
export const quarantineActions: RowAction[] = [
  step(
    'release',
    'compliance.quarantine.approve',
    (r) => C(`quarantine/${id(r)}/release`),
    (r) => r.status === 'QUARANTINED',
    {
      confirm: false,
      fields: [f('note', { required: true })],
      formBody: (v) => ({ note: tx(v, 'note') }),
    },
  ),
  step(
    'dispose',
    'compliance.quarantine.manage',
    (r) => C(`quarantine/${id(r)}/dispose`),
    (r) => r.status === 'QUARANTINED',
    {
      confirm: false,
      fields: [
        f('action', { kind: 'select', options: ['DESTROY', 'RETURN'] }),
        f('method', { required: true }),
        f('witness'),
        f('evidenceRef'),
      ],
      formBody: (v) => ({
        action: v.action,
        method: tx(v, 'method'),
        witness: tn(v, 'witness'),
        evidenceRef: tn(v, 'evidenceRef'),
      }),
    },
  ),
];
export const caseActions: RowAction[] = [
  step(
    'triage',
    'compliance.case.manage',
    (r) => C(`cases/${id(r)}/triage`),
    (r) => r.status === 'OPEN',
  ),
  step(
    'escalate',
    'compliance.case.manage',
    (r) => C(`cases/${id(r)}/escalate`),
    (r) => r.status !== 'CLOSED',
  ),
  step(
    'caseClose',
    'compliance.case.manage',
    (r) => C(`cases/${id(r)}/close`),
    (r) => r.status !== 'CLOSED',
    {
      confirm: false,
      fields: [f('outcome', { required: true })],
      formBody: (v) => ({ outcome: tx(v, 'outcome') }),
    },
  ),
];
export const sampleActions: RowAction[] = [
  step(
    'result',
    'compliance.sample.manage',
    (r) => C(`samples/${id(r)}/result`),
    (r) => r.status !== 'CLOSED' && r.status !== 'RESULT_RECORDED',
    {
      confirm: false,
      fields: [
        f('outcome', { kind: 'select', options: ['PASS', 'FAIL', 'INCONCLUSIVE'] }),
        f('lab'),
        f('reportRef'),
        f('detail', { kind: 'area' }),
        f('batchAction', { kind: 'select', options: ['NONE', 'QUARANTINE'] }),
      ],
      formBody: (v) => ({
        outcome: v.outcome,
        lab: tn(v, 'lab'),
        reportRef: tn(v, 'reportRef'),
        detail: tn(v, 'detail'),
        batchAction: v.batchAction,
      }),
    },
  ),
  step(
    'custody',
    'compliance.sample.manage',
    (r) => C(`samples/${id(r)}/custody`),
    (r) => r.status !== 'CLOSED',
    {
      confirm: false,
      fields: [f('fromParty', { required: true }), f('toParty', { required: true }), f('note')],
      formBody: (v) => ({ from: tx(v, 'fromParty'), to: tx(v, 'toParty'), note: tn(v, 'note') }),
    },
  ),
];
/** Rule versions: test and submit (manage), approve / activate / retire (approve), on the version id, like the web. */
export const ruleActions: RowAction[] = [
  step(
    'ruleTest',
    'compliance.rules.manage',
    (r) => C(`rule-versions/${id(r)}/test`),
    (r) => r.status === 'DRAFT',
  ),
  step(
    'ruleSubmit',
    'compliance.rules.manage',
    (r) => C(`rule-versions/${id(r)}/submit`),
    (r) => r.status === 'DRAFT',
  ),
  step(
    'ruleApprove',
    'compliance.rules.approve',
    (r) => C(`rule-versions/${id(r)}/approve`),
    (r) => r.status === 'SUBMITTED',
  ),
  step(
    'ruleActivate',
    'compliance.rules.approve',
    (r) => C(`rule-versions/${id(r)}/activate`),
    (r) => r.status === 'APPROVED' && !r.inForce,
  ),
  step(
    'ruleRetire',
    'compliance.rules.approve',
    (r) => C(`rule-versions/${id(r)}/retire`),
    (r) => r.status === 'APPROVED',
  ),
];
/** One row per version, carrying the rule's code and name (the web's rulesTab). */
export const ruleRows = (rows: Row[]): Row[] =>
  rows.flatMap((rule) => {
    const vs = Array.isArray(rule.versions) ? (rule.versions as Row[]) : [];
    return vs.length
      ? vs.map((x) => ({ ...x, code: rule.code, name: rule.name, ruleId: rule.id }))
      : [{ ...rule, ruleId: rule.id }];
  });
/** Report templates with their newest version, the draft to approve and whether one is approved (the web's templatesTab). */
export const templateRows = (rows: Row[]): Row[] =>
  rows.map((t) => {
    const vs = Array.isArray(t.versions) ? (t.versions as Row[]) : [];
    const top = vs[0];
    return {
      ...t,
      version: top?.version ?? '',
      status: top?.status ?? '',
      draftVersionId: vs.find((x) => x.status === 'DRAFT')?.id ?? null,
      approvedVersion: vs.some((x) => x.status === 'APPROVED'),
    };
  });
export const templateActions: RowAction[] = [
  step(
    'templateApprove',
    'compliance.reports.approve',
    (r) => C(`report-template-versions/${String(r.draftVersionId)}/approve`),
    (r) => !!r.draftVersionId,
  ),
  step(
    'generate',
    'compliance.reports.manage',
    (r) => C(`report-templates/${id(r)}/generate`),
    (r) => r.approvedVersion === true,
    {
      confirm: false,
      fields: [f('from', { kind: 'date', required: true }), f('to', { kind: 'date', required: true })],
      formBody: (v) => ({ from: tx(v, 'from'), to: tx(v, 'to') }),
    },
  ),
];
