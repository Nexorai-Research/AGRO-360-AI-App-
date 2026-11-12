import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { shortDate } from '../hr/logic';
import {
  Area,
  Btn,
  Card,
  Check,
  Chips,
  Empty,
  Field,
  Msgs,
  Page,
  Read,
  blank,
  kit,
  today,
  useStk,
  useWrite,
  validDay,
  validDec,
} from './kit';

// Product extras the web "product detail" has and the first product screens did not: alternate units, tax mapping, change history,
// composition (view) and regulated flags. Paths: apps/api/src/catalogue.controller.ts.
interface UnitRow {
  code: string;
  isBase: boolean;
  factor: string;
  precision: number;
}
interface TaxInfo {
  current: { hsnCode: string | null; taxCode: string | null } | null;
  resolved: { code?: string; ratePct?: string | null } | null;
  history: { effectiveFrom: string; hsnCode: string | null; taxCode: string | null; reason: string | null }[];
}
interface Hist {
  at: string;
  action: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
}
interface Prod {
  id: string;
  version: number;
  name: string;
  regulatedType: string;
  requiresRecommendation: boolean;
  requiresFarmerId: boolean;
  maxQtyPerCustomerDay: string | null;
  saleBlocked: boolean;
  banned: boolean;
}
const REG = ['NONE', 'FERTILIZER', 'PESTICIDE', 'SEED'] as const;

/** "BAG=50" per line. Returns code and factor (up to 4 places), or the first bad line number. */
export function parseUnitLines(
  text: string,
): { rows: { code: string; factor: string }[] } | { badLine: number } {
  const rows: { code: string; factor: string }[] = [];
  for (const [i, ln] of text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .entries()) {
    const [code, factor] = ln.split('=').map((s) => s.trim());
    if (!code || !factor || !validDec(factor, 4)) return { badLine: i + 1 };
    rows.push({ code: code.toUpperCase(), factor });
  }
  return { rows };
}

function UnitsEdit({ id, current }: { id: string; current: UnitRow[] }) {
  const { t } = useStk();
  const w = useWrite();
  const [text, setText] = useState<string | null>(null);
  return (
    <Read<{ items: { id: string; code: string }[] }> path="/uoms">
      {(all) => {
        const parsed = parseUnitLines(text ?? '');
        const unknown =
          'rows' in parsed && parsed.rows.some((r) => !all.items.find((a) => a.code === r.code));
        return (
          <>
            <Btn
              kind="ghost"
              label={t('stkProd.editUnits')}
              onPress={() =>
                setText(
                  text === null
                    ? current
                        .filter((x) => !x.isBase)
                        .map((x) => `${x.code}=${x.factor}`)
                        .join('\n')
                    : null,
                )
              }
            />
            {text !== null ? (
              <Card>
                <Text style={kit.sub}>{t('stkProd.unitsHint')}</Text>
                <Area label={t('stkProd.unitLines')} value={text} onChange={setText} />
                {'badLine' in parsed ? (
                  <Text style={kit.sub}>{t('stkProd.badLine', { n: parsed.badLine })}</Text>
                ) : null}
                {unknown ? <Text style={kit.sub}>{t('stkProd.unknownUnit')}</Text> : null}
                <Msgs w={w} />
                <Btn
                  label={t('stkProd.saveUnits')}
                  disabled={w.busy || !('rows' in parsed) || unknown}
                  onPress={() =>
                    void w.put(
                      `/products/${id}/units`,
                      {
                        units: (parsed as { rows: { code: string; factor: string }[] }).rows.map((r) => ({
                          uomId: all.items.find((a) => a.code === r.code)!.id,
                          factor: r.factor,
                        })),
                      },
                      t('stkProd.unitsSaved'),
                      { after: () => setText(null) },
                    )
                  }
                />
              </Card>
            ) : null}
          </>
        );
      }}
    </Read>
  );
}

function Units({ id }: { id: string }) {
  const { t, can } = useStk();
  return (
    <Read<{ items: UnitRow[] }> path={`/products/${id}/units`}>
      {(u) => (
        <>
          {u.items.map((x) => (
            <Card key={x.code}>
              <Text style={kit.name}>
                {x.code}
                {x.isBase ? ` (${t('stkProd.base')})` : ''}
              </Text>
              <Text style={kit.sub}>
                {t('stkProd.factor', { factor: x.factor })} · {t('stkProd.places', { count: x.precision })}
              </Text>
            </Card>
          ))}
          {can('product.uom.manage') ? <UnitsEdit id={id} current={u.items} /> : null}
        </>
      )}
    </Read>
  );
}

function Tax({ id }: { id: string }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today());
  const [hsn, setHsn] = useState('');
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Read<TaxInfo> path={`/products/${id}/tax`}>
      {(x) => (
        <>
          <Card>
            <Text style={kit.name}>
              {t('stkProd.today', { hsn: x.current?.hsnCode ?? '-', code: x.current?.taxCode ?? '-' })}
            </Text>
            {x.resolved?.ratePct != null ? (
              <Text style={kit.sub}>
                {t('stkProd.rate', { code: x.resolved.code ?? '', rate: x.resolved.ratePct })}
              </Text>
            ) : null}
          </Card>
          {x.history.map((h, i) => (
            <Card key={i}>
              <Text style={kit.name}>{t('stkProd.from', { date: shortDate(h.effectiveFrom) })}</Text>
              <Text style={kit.sub}>
                {[h.hsnCode ? `HSN ${h.hsnCode}` : null, h.taxCode, h.reason].filter(Boolean).join(' · ')}
              </Text>
            </Card>
          ))}
          {can('product.tax.manage') ? (
            <Btn kind="ghost" label={t('stkProd.changeTax')} onPress={() => setOpen(!open)} />
          ) : null}
          {open ? (
            <Card>
              <Text style={kit.sub}>{t('stkProd.taxHint')}</Text>
              <Field
                label={t('stkProd.effective')}
                value={from}
                onChange={setFrom}
                placeholder="YYYY-MM-DD"
                error={validDay(from) ? null : t('stk.badDate')}
              />
              <Field label={t('stkProd.hsn')} value={hsn} onChange={setHsn} keyboard="numeric" />
              <Field label={t('stkProd.taxCode')} value={code} onChange={setCode} />
              <Check label={t('stkProd.hsnConfirm')} value={confirmed} onChange={setConfirmed} />
              <Field label={t('stkProd.reason')} value={reason} onChange={setReason} />
              <Msgs w={w} />
              <Btn
                label={t('stkProd.saveTax')}
                disabled={w.busy || !validDay(from) || (!blank(hsn) && !blank(code))}
                onPress={() =>
                  void w.post(
                    `/products/${id}/tax`,
                    {
                      effectiveFrom: from.trim(),
                      ...(blank(hsn) ? { hsnCode: hsn.trim() } : {}),
                      ...(blank(code) ? { taxCode: code.trim() } : {}),
                      ...(confirmed ? { hsnConfirmed: true } : {}),
                      ...(blank(reason) ? { reason: reason.trim() } : {}),
                    },
                    t('stkProd.taxSaved'),
                    { after: () => setOpen(false) },
                  )
                }
              />
            </Card>
          ) : null}
        </>
      )}
    </Read>
  );
}

function History({ id }: { id: string }) {
  const { t } = useStk();
  return (
    <Read<{ items: Hist[] }> path={`/products/${id}/history`}>
      {(d) => (
        <>
          {d.items.length === 0 ? <Empty text={t('stkProd.noHistory')} /> : null}
          {d.items.map((h, i) => (
            <Card key={i}>
              <Text style={kit.name}>
                {h.action} · {h.field}
              </Text>
              <Text style={kit.sub}>
                {[shortDate(h.at), `${h.oldValue ?? '-'} -> ${h.newValue ?? '-'}`, h.reason]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
          ))}
        </>
      )}
    </Read>
  );
}

function Composition({ id }: { id: string }) {
  const { t } = useStk();
  return (
    <Read<{
      items: { ingredientName: string; percentage: string; formulation: string | null; banned?: boolean }[];
    }>
      path={`/products/${id}/composition`}
    >
      {(d) => (
        <>
          {d.items.length === 0 ? <Empty text={t('stkProd.noComposition')} /> : null}
          {d.items.map((x, i) => (
            <Card key={i}>
              <Text style={kit.name}>
                {x.ingredientName}
                {x.banned ? ` - ${t('stkProd.banned')}` : ''}
              </Text>
              <Text style={kit.sub}>{[`${x.percentage}%`, x.formulation].filter(Boolean).join(' · ')}</Text>
            </Card>
          ))}
        </>
      )}
    </Read>
  );
}

function Compliance({ id }: { id: string }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [edit, setEdit] = useState<Prod | null>(null);
  const [reg, setReg] = useState('NONE');
  const [rec, setRec] = useState(false);
  const [farmer, setFarmer] = useState(false);
  const [max, setMax] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [banned, setBanned] = useState(false);
  const start = (p: Prod) => {
    setEdit(p);
    setReg(p.regulatedType);
    setRec(p.requiresRecommendation);
    setFarmer(p.requiresFarmerId);
    setMax(p.maxQtyPerCustomerDay ?? '');
    setBlocked(p.saleBlocked);
    setBanned(p.banned);
  };
  return (
    <Read<Prod> path={`/products/${id}`}>
      {(p) => (
        <>
          <Card>
            <Text style={kit.name}>{t('stkProd.regType', { type: p.regulatedType })}</Text>
            <Text style={kit.sub}>
              {t('stkProd.farmerId', { v: p.requiresFarmerId ? t('stkProd.yes') : t('stkProd.no') })}
            </Text>
            <Text style={kit.sub}>
              {t('stkProd.recommend', { v: p.requiresRecommendation ? t('stkProd.yes') : t('stkProd.no') })}
            </Text>
            {p.maxQtyPerCustomerDay ? (
              <Text style={kit.sub}>{t('stkProd.maxPerDay', { qty: p.maxQtyPerCustomerDay })}</Text>
            ) : null}
            {p.banned ? <Text style={kit.name}>{t('stkProd.banned')}</Text> : null}
            {p.saleBlocked ? <Text style={kit.name}>{t('stkProd.saleBlocked')}</Text> : null}
          </Card>
          {can('product.regulated') ? (
            <Btn
              kind="ghost"
              label={t('stkProd.editFlags')}
              onPress={() => (edit ? setEdit(null) : start(p))}
            />
          ) : (
            <Text style={kit.sub}>{t('stkProd.needRegulated')}</Text>
          )}
          {edit ? (
            <Card>
              <Chips
                label={t('stkProd.regulated')}
                options={REG.map((r) => ({ id: r as string, label: r }))}
                value={reg}
                onChange={setReg}
              />
              <Check label={t('stkProd.needRecommend')} value={rec} onChange={setRec} />
              <Check label={t('stkProd.needFarmer')} value={farmer} onChange={setFarmer} />
              <Field
                label={t('stkProd.maxLabel')}
                value={max}
                onChange={setMax}
                keyboard="decimal-pad"
                error={max && !validDec(max, 3) ? t('stk.badQty') : null}
              />
              <Check label={t('stkProd.blockSale')} value={blocked} onChange={setBlocked} />
              <Check label={t('stkProd.ban')} value={banned} onChange={setBanned} />
              <Msgs w={w} />
              <Btn
                label={t('stkProd.saveFlags')}
                disabled={w.busy || (max !== '' && !validDec(max, 3))}
                onPress={() =>
                  void w.patch(
                    `/products/${id}`,
                    {
                      regulatedType: reg,
                      requiresRecommendation: rec,
                      requiresFarmerId: farmer,
                      maxQtyPerCustomerDay: blank(max) ?? null,
                      saleBlocked: blocked,
                      banned,
                    },
                    t('stkProd.flagsSaved'),
                    { version: p.version, after: () => setEdit(null) },
                  )
                }
              />
            </Card>
          ) : null}
        </>
      )}
    </Read>
  );
}

export default function ProductMoreScreen() {
  const { t, can } = useStk();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<'units' | 'tax' | 'history' | 'composition' | 'compliance'>('units');
  return (
    <Page title={t('stkProd.title')} allowed={can('product.view') && id !== ''}>
      <Chips
        label={t('stkProd.show')}
        options={(['units', 'tax', 'history', 'composition', 'compliance'] as const).map((k) => ({
          id: k,
          label: t(`stkProd.tab_${k}`),
        }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'units' ? <Units id={id} /> : null}
      {tab === 'tax' ? <Tax id={id} /> : null}
      {tab === 'history' ? <History id={id} /> : null}
      {tab === 'composition' ? <Composition id={id} /> : null}
      {tab === 'compliance' ? <Compliance id={id} /> : null}
    </Page>
  );
}
