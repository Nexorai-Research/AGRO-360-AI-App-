import { useState, type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatINR } from '../../money';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { saveAndShare } from '../admin/usr-files';
import { SCAN_TYPES, pickScan } from '../ai/file-g4';
import { todayIST } from '../collections/receipt';
import { Chips, Field, useActionKey } from '../purchase/ui';
import { fetchHousehold } from './more-api';
import { STATEMENT_PERM, statementPdf } from './statement-pdf';
import { Body, Collapse, Msg, s, usePanel } from './plans-ui';
import {
  DOC_TYPES,
  KYC_MAX_BYTES,
  SEASONS,
  XPERM,
  addGuarantor,
  applicationBody,
  applicationErrors,
  createHousehold,
  documentBody,
  documentContent,
  emptyApplication,
  emptyGuarantor,
  fetchApplications,
  fetchDocuments,
  fetchGuarantors,
  fetchOpenTasks,
  fetchPointsLedger,
  fetchPurchases,
  postApplication,
  guarantorBody,
  guarantorErrors,
  householdBody,
  realDay,
  removeDocument,
  removeGuarantor,
  shareStatement,
  taskDone,
  uploadDocument,
  validTtl,
  verifyApplication,
  type ApplicationForm,
  type GuarantorForm,
} from './extras-api';

type P = { customerId: string; open: boolean };
const dayOf = (iso: string) => iso.slice(0, 10);

// ---- 1.1 open tasks --------------------------------------------------------------------------------------------------------
function Tasks({ customerId, open }: P) {
  const { t } = useTranslation();
  const key = useActionKey();
  const { sal, q } = usePanel(open, 'x-tasks', customerId, (c, sig) => fetchOpenTasks(c, customerId, sig));
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('wp1.tasks.none')}</Text>
          ) : (
            <>
              {rows.map((x) => (
                <View key={x.id} style={s.item}>
                  <Text style={s.name}>{x.title}</Text>
                  <Text style={x.overdue ? s.err : s.sub}>
                    {t('wp1.tasks.due', { date: x.dueOn })}
                    {x.overdue ? ` · ${t('wp1.tasks.overdue')}` : ''}
                  </Text>
                  <Button
                    kind="ghost"
                    label={`${t('wp1.tasks.done')} ${x.title}`}
                    disabled={sal.busy}
                    onPress={() =>
                      void sal.act(
                        t('wp1.tasks.doneMsg'),
                        () => taskDone(sal.client!, x.id, key.keyFor(`d|${x.id}`)),
                        () => key.reset(),
                      )
                    }
                  />
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

// ---- 1.3 inputs applied ----------------------------------------------------------------------------------------------------
function Inputs({ customerId, open }: P) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<ApplicationForm>(emptyApplication(todayIST()));
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'x-apps', customerId, (c, sig) => fetchApplications(c, customerId, sig));
  const can = sal.can(XPERM.applications);
  const errs = applicationErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`wp1.inputs.v.${e}`) : null);
  const close = () => (setAdding(false), setTried(false), key.reset());
  function save() {
    setTried(true);
    if (applicationErrors(f).length > 0) return;
    const body = applicationBody(f);
    void sal.act(
      t('wp1.inputs.saved'),
      () => postApplication(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => (close(), setF(emptyApplication(todayIST()))),
    );
  }
  const set = (k: keyof ApplicationForm) => (v: string) => setF({ ...f, [k]: v });
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {can && !adding ? (
        <Button label={t('wp1.inputs.record')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Field
            label={t('wp1.inputs.product')}
            value={f.productName}
            onChange={set('productName')}
            error={bad('product')}
          />
          <Field
            label={t('wp1.inputs.batch')}
            value={f.batchNo}
            onChange={set('batchNo')}
            error={bad('batch')}
          />
          <Field
            label={t('wp1.inputs.qty')}
            value={f.qty}
            onChange={set('qty')}
            keyboard="decimal-pad"
            error={bad('qty')}
          />
          <Field label={t('wp1.inputs.unit')} value={f.unit} onChange={set('unit')} error={bad('unit')} />
          <Field
            label={t('wp1.inputs.date')}
            value={f.appliedOn}
            onChange={set('appliedOn')}
            placeholder="YYYY-MM-DD"
            error={bad('date')}
          />
          <Field
            label={t('wp1.inputs.method')}
            value={f.method}
            onChange={set('method')}
            error={bad('method')}
          />
          <Field
            label={t('wp1.inputs.check')}
            value={f.regulatedCheck}
            onChange={set('regulatedCheck')}
            error={bad('check')}
          />
          <View style={s.row}>
            <Button label={t('customers.plans.save')} disabled={sal.busy} onPress={save} />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('wp1.inputs.none')}</Text>
          ) : (
            <>
              {rows.map((a) => (
                <View key={a.id} style={s.item}>
                  <Text style={s.name}>
                    {a.productName}
                    {a.regulated ? ` (${t('wp1.inputs.regulated')})` : ''}
                  </Text>
                  <Text style={s.sub}>
                    {[
                      a.appliedOn,
                      `${Number(a.qty)} ${a.unit}`,
                      a.batchNo,
                      t(`wp1.inputs.src.${a.source}`, { defaultValue: a.source }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {a.verified ? (
                    <Text style={{ color: colors.ok }}>{t('wp1.inputs.verified')}</Text>
                  ) : can ? (
                    <Button
                      kind="ghost"
                      label={`${t('wp1.inputs.verify')} ${a.productName}`}
                      disabled={sal.busy}
                      onPress={() =>
                        void sal.act(
                          t('wp1.inputs.verifiedMsg'),
                          () => verifyApplication(sal.client!, customerId, a.id, key.keyFor(`v|${a.id}`)),
                          () => key.reset(),
                        )
                      }
                    />
                  ) : (
                    <Text style={s.sub}>{t('wp1.inputs.notYet')}</Text>
                  )}
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

// ---- 1.5 KYC documents -----------------------------------------------------------------------------------------------------
function Documents({ customerId, open }: P) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ docType: 'AADHAAR', number: '', expiresOn: '' });
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const { sal, q } = usePanel(open, 'x-docs', customerId, (c, sig) => fetchDocuments(c, customerId, sig));
  const can = sal.can(XPERM.kyc);
  const close = () => (setAdding(false), setFile(null), setFileErr(null), key.reset());
  async function pick() {
    setFileErr(null);
    const r = await pickScan(SCAN_TYPES);
    if (!r.ok) {
      if (r.reason !== 'CANCELLED')
        setFileErr(t(r.reason === 'TOO_BIG' ? 'wp1.docs.tooBig' : 'wp1.docs.badType'));
      return;
    }
    if (r.file.bytes > KYC_MAX_BYTES) return setFileErr(t('wp1.docs.tooBig'));
    setFile({ name: r.file.name, base64: r.file.base64 });
  }
  function upload() {
    if (!file) return setFileErr(t('wp1.docs.chooseFile'));
    if (f.expiresOn.trim() !== '' && !realDay(f.expiresOn)) return setFileErr(t('wp1.docs.badDate'));
    const body = documentBody(f, file);
    void sal.act(
      t('wp1.docs.uploaded'),
      () =>
        uploadDocument(
          sal.client!,
          customerId,
          body,
          key.keyFor(`${f.docType}|${f.number}|${file.name}|${file.base64.length}`),
        ),
      () => (close(), setF({ docType: 'AADHAAR', number: '', expiresOn: '' })),
    );
  }
  async function download(docId: string) {
    sal.setFailure(null);
    try {
      const d = await documentContent(sal.client!, customerId, docId);
      if (!(await saveAndShare(d.filename, d.contentType, d.contentBase64)))
        sal.setFailure(t('wp1.docs.noShare'));
    } catch {
      sal.setFailure(t('wp1.docs.downloadFailed'));
    }
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {can && !adding ? (
        <Button label={t('wp1.docs.upload')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Text style={s.sub}>{t('wp1.docs.intro')}</Text>
          <Chips
            options={DOC_TYPES.map((x) => ({ value: x, label: t(`wp1.docs.type.${x}`) }))}
            value={f.docType}
            onChange={(v) => setF({ ...f, docType: v })}
          />
          <Field label={t('wp1.docs.number')} value={f.number} onChange={(v) => setF({ ...f, number: v })} />
          <Field
            label={t('wp1.docs.expires')}
            value={f.expiresOn}
            onChange={(v) => setF({ ...f, expiresOn: v })}
            placeholder="YYYY-MM-DD"
          />
          <Button kind="ghost" label={file ? file.name : t('wp1.docs.pick')} onPress={() => void pick()} />
          {fileErr ? <Text style={s.err}>{fileErr}</Text> : null}
          <View style={s.row}>
            <Button label={t('wp1.docs.uploadNow')} disabled={sal.busy} onPress={upload} />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('wp1.docs.none')}</Text>
          ) : (
            <>
              {rows.map((d) => (
                <View key={d.id} style={s.item}>
                  <Text style={s.name}>
                    {t(`wp1.docs.type.${d.docType}`, { defaultValue: d.docType })} · {d.numberMasked ?? '-'}
                  </Text>
                  <Text style={d.expired ? s.err : s.sub}>
                    {d.filename}
                    {d.expiresOn ? ` · ${t('wp1.docs.expiresOn', { date: d.expiresOn })}` : ''}
                    {d.expired ? ` · ${t('wp1.docs.expired')}` : ''}
                  </Text>
                  <View style={s.row}>
                    <Button
                      kind="ghost"
                      label={`${t('wp1.docs.download')} ${d.filename}`}
                      onPress={() => void download(d.id)}
                    />
                    {can && confirm !== d.id ? (
                      <Button
                        kind="ghost"
                        label={`${t('wp1.docs.remove')} ${d.filename}`}
                        onPress={() => setConfirm(d.id)}
                      />
                    ) : null}
                  </View>
                  {confirm === d.id ? (
                    <View style={s.row}>
                      <Text style={s.err}>{t('wp1.docs.removeWarn')}</Text>
                      <Button
                        label={t('wp1.docs.removeNow')}
                        disabled={sal.busy}
                        onPress={() =>
                          void sal.act(
                            t('wp1.docs.removed'),
                            () => removeDocument(sal.client!, customerId, d.id, key.keyFor(`r|${d.id}`)),
                            () => (setConfirm(null), key.reset()),
                          )
                        }
                      />
                      <Button
                        kind="ghost"
                        label={t('customers.plans.cancel')}
                        onPress={() => setConfirm(null)}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

// ---- 1.6 points history ----------------------------------------------------------------------------------------------------
function Points({ customerId, open }: P) {
  const { t } = useTranslation();
  const { q } = usePanel(open, 'x-points', customerId, (c, sig) => fetchPointsLedger(c, customerId, sig));
  return (
    <Body q={q}>
      {(rows) =>
        rows.length === 0 ? (
          <Text style={s.sub}>{t('wp1.points.none')}</Text>
        ) : (
          <>
            {rows.map((x) => (
              <View key={x.id} style={s.item}>
                <Text style={s.name}>
                  {x.points > 0 ? `+${x.points}` : String(x.points)} {t('wp1.points.pts')}
                </Text>
                <Text style={s.sub}>{[dayOf(x.at), x.reason, x.ref].filter(Boolean).join(' · ')}</Text>
              </View>
            ))}
          </>
        )
      }
    </Body>
  );
}

// ---- 1.8 new household -----------------------------------------------------------------------------------------------------
function Household({ customerId, open }: P) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'x-household', customerId, (c, sig) =>
    fetchHousehold(c, customerId, sig),
  );
  const bad = tried && (name.trim().length < 1 || name.trim().length > 120);
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      <Body q={q}>
        {(h) =>
          h ? (
            <Text style={s.sub}>{t('wp1.household.has', { name: h.name })}</Text>
          ) : (
            <View style={s.card}>
              <Field
                label={t('wp1.household.name')}
                value={name}
                onChange={setName}
                error={bad ? t('wp1.household.v') : null}
              />
              <Button
                label={t('wp1.household.create')}
                disabled={sal.busy}
                onPress={() => {
                  setTried(true);
                  if (name.trim().length < 1 || name.trim().length > 120) return;
                  const body = householdBody(name, customerId);
                  void sal.act(
                    t('wp1.household.created'),
                    () => createHousehold(sal.client!, body, key.keyFor(JSON.stringify(body))),
                    () => (key.reset(), setName(''), setTried(false)),
                  );
                }}
              />
            </View>
          )
        }
      </Body>
    </>
  );
}

// ---- 1.9 purchase history --------------------------------------------------------------------------------------------------
function Purchases({ customerId, open }: P) {
  const { t } = useTranslation();
  const [season, setSeason] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const yearOk = /^\d{4}$/.test(year.trim());
  const f = { season, year: year.trim() };
  const { q } = usePanel(
    open,
    `x-purchases|${season}|${season ? year.trim() : ''}`,
    customerId,
    (c, sig) => fetchPurchases(c, customerId, f, sig),
    !season || yearOk,
  );
  return (
    <>
      <Chips
        options={[
          { value: '', label: t('wp1.purchases.all') },
          ...SEASONS.map((x) => ({ value: x, label: t(`customers.season.${x}`, { defaultValue: x }) })),
        ]}
        value={season}
        onChange={setSeason}
      />
      {season ? (
        <Field
          label={t('wp1.purchases.year')}
          value={year}
          onChange={setYear}
          keyboard="numeric"
          error={yearOk ? null : t('wp1.purchases.badYear')}
        />
      ) : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('wp1.purchases.none')}</Text>
          ) : (
            <>
              {rows.map((x, i) => (
                <View key={`${x.number}-${x.sku_code}-${i}`} style={s.item}>
                  <Text style={s.name}>
                    {x.sku_code} {x.sku_name}
                  </Text>
                  <Text style={s.sub}>
                    {[
                      x.number,
                      x.d,
                      x.batch_no ? t('wp1.purchases.batch', { no: x.batch_no }) : null,
                      `${Number(x.qty)}${Number(x.returned) ? ` (${t('wp1.purchases.returned', { qty: Number(x.returned) })})` : ''}`,
                      formatINR(x.line_total),
                      t(`wp1.purchases.st.${x.status}`, { defaultValue: x.status }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

// ---- 1.4 guarantors --------------------------------------------------------------------------------------------------------
function Guarantors({ customerId, open }: P) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<GuarantorForm>(emptyGuarantor());
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'x-guarantors', customerId, (c, sig) =>
    fetchGuarantors(c, customerId, sig),
  );
  const can = sal.can(XPERM.guarantor);
  const errs = guarantorErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`wp1.guar.v.${e}`) : null);
  const close = () => (setAdding(false), setTried(false), key.reset());
  const set = (k: keyof GuarantorForm) => (v: string) => setF({ ...f, [k]: v });
  function save() {
    setTried(true);
    if (guarantorErrors(f).length > 0) return;
    const body = guarantorBody(f);
    void sal.act(
      t('wp1.guar.added'),
      () => addGuarantor(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => (close(), setF(emptyGuarantor())),
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {can && !adding ? (
        <Button label={t('wp1.guar.add')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Field label={t('wp1.guar.name')} value={f.name} onChange={set('name')} error={bad('name')} />
          <Field
            label={t('wp1.guar.mobile')}
            value={f.mobile}
            onChange={set('mobile')}
            keyboard="phone-pad"
            error={bad('mobile')}
          />
          <Field
            label={t('wp1.guar.relationship')}
            value={f.relationship}
            onChange={set('relationship')}
            error={bad('relationship')}
          />
          <Field
            label={t('wp1.guar.document')}
            value={f.documentRef}
            onChange={set('documentRef')}
            error={bad('document')}
          />
          <Field
            label={t('wp1.guar.amount')}
            value={f.limitCovered}
            onChange={set('limitCovered')}
            keyboard="decimal-pad"
            error={bad('amount')}
          />
          <View style={s.row}>
            <Button label={t('customers.plans.save')} disabled={sal.busy} onPress={save} />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('wp1.guar.none')}</Text>
          ) : (
            <>
              {rows.map((x) => (
                <View key={x.id} style={s.item}>
                  <Text style={s.name}>
                    {x.name} · {x.relationship}
                  </Text>
                  <Text style={s.sub}>
                    {[
                      x.mobile,
                      x.limitCovered ? t('wp1.guar.covers', { amount: formatINR(x.limitCovered) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {x.overdue ? (
                    <Text style={s.err}>{t('wp1.guar.overdue', { amount: formatINR(x.overdue) })}</Text>
                  ) : null}
                  {can ? (
                    <Button
                      kind="ghost"
                      label={`${t('wp1.guar.remove')} ${x.name}`}
                      disabled={sal.busy}
                      onPress={() =>
                        void sal.act(
                          t('wp1.guar.removed'),
                          () => removeGuarantor(sal.client!, customerId, x.id, key.keyFor(`r|${x.id}`)),
                          () => key.reset(),
                        )
                      }
                    />
                  ) : null}
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

// ---- 1.7 share the statement -------------------------------------------------------------------------------------------------
function Share({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const { sal } = usePanel(false, 'x-share', customerId);
  const [language, setLanguage] = useState('');
  const [ttl, setTtl] = useState('30');
  const [send, setSend] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const ttlOk = validTtl(ttl);
  return (
    <>
      <Text style={s.sub}>{t('wp1.share.intro')}</Text>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      <Text style={s.label}>{t('wp1.share.language')}</Text>
      <Chips
        options={[
          { value: '', label: t('wp1.share.customerLang') },
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिन्दी' },
          { value: 'mr', label: 'मराठी' },
        ]}
        value={language}
        onChange={setLanguage}
      />
      <Field
        label={t('wp1.share.days')}
        value={ttl}
        onChange={setTtl}
        keyboard="numeric"
        error={ttlOk ? null : t('wp1.share.badDays')}
      />
      <Text style={s.label}>{t('wp1.share.send')}</Text>
      <Chips
        options={[
          { value: 'no', label: t('customers.plans.no') },
          { value: 'yes', label: t('customers.plans.yes') },
        ]}
        value={send ? 'yes' : 'no'}
        onChange={(v) => setSend(v === 'yes')}
      />
      <Button
        label={t('wp1.share.make')}
        disabled={sal.busy || !ttlOk}
        onPress={() => {
          const b = { language, ttlDays: ttl.trim(), send };
          void sal.act(
            t('wp1.share.made'),
            async () => {
              const r = await shareStatement(sal.client!, customerId, b, key.keyFor(JSON.stringify(b)));
              setLink(r.url);
              if (r.message)
                sal.setMsg(
                  t('wp1.share.whatsapp', {
                    status: r.message.status.toLowerCase(),
                    reason: r.message.reason ? ` (${r.message.reason})` : '',
                  }),
                );
            },
            () => key.reset(),
          );
        }}
      />
      {link ? (
        <View style={s.item}>
          <Text selectable style={s.name}>
            {link}
          </Text>
          <Button kind="ghost" label={t('wp1.share.open')} onPress={() => void Linking.openURL(link)} />
        </View>
      ) : null}
      {sal.can(STATEMENT_PERM) ? (
        <Button
          kind="ghost"
          label={t('wp9.st.pdf')}
          disabled={sal.busy}
          onPress={() =>
            void sal.act(t('wp9.st.done'), async () => {
              const ok = await statementPdf(sal.client!, customerId, language);
              if (!ok) throw new Error(t('wp9.st.noSharing'));
            })
          }
        />
      ) : null}
    </>
  );
}

/** Web parity phase 1 on the customer 360: tasks, inputs applied, KYC files, points history, household, purchase history, guarantors and statement link. */
export function CustomerExtras({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { sal } = usePanel(false, 'x-gate', customerId);
  const parts: { k: string; perm: string; title: string; body: (open: boolean) => ReactNode }[] = [
    {
      k: 'tasks',
      perm: XPERM.tasks,
      title: t('wp1.tasks.title'),
      body: (o) => <Tasks customerId={customerId} open={o} />,
    },
    {
      k: 'inputs',
      perm: XPERM.view,
      title: t('wp1.inputs.title'),
      body: (o) => <Inputs customerId={customerId} open={o} />,
    },
    {
      k: 'docs',
      perm: XPERM.kycView,
      title: t('wp1.docs.title'),
      body: (o) => <Documents customerId={customerId} open={o} />,
    },
    {
      k: 'points',
      perm: XPERM.view,
      title: t('wp1.points.title'),
      body: (o) => <Points customerId={customerId} open={o} />,
    },
    {
      k: 'household',
      perm: XPERM.household,
      title: t('wp1.household.title'),
      body: (o) => <Household customerId={customerId} open={o} />,
    },
    {
      k: 'purchases',
      perm: XPERM.view,
      title: t('wp1.purchases.title'),
      body: (o) => <Purchases customerId={customerId} open={o} />,
    },
    {
      k: 'guarantors',
      perm: XPERM.credit,
      title: t('wp1.guar.title'),
      body: (o) => <Guarantors customerId={customerId} open={o} />,
    },
    {
      k: 'share',
      perm: XPERM.share,
      title: t('wp1.share.title'),
      body: () => <Share customerId={customerId} />,
    },
  ];
  return (
    <>
      {parts
        .filter((p) => sal.can(p.perm))
        .map((p) => (
          <Collapse key={p.k} title={p.title}>
            {p.body}
          </Collapse>
        ))}
    </>
  );
}
