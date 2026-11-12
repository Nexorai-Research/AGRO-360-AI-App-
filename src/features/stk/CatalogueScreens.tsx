import { useState } from 'react';
import { Text, View } from 'react-native';
import { formatINR } from '@/money';
import { ApiError } from '@/api/errors';
import { shortDate } from '../hr/logic';
import { Line } from '../hr/kit';
import {
  Area,
  Btn,
  Card,
  Check,
  Chips,
  Empty,
  Field,
  Msgs,
  Notice,
  Page,
  Read,
  blank,
  kit,
  today,
  tone,
  useStk,
  useWrite,
  validDay,
} from './kit';

// Catalogue masters. Paths and permissions from apps/api/src/catalogue.controller.ts and apps/web/src/pages/products.js.
const REGULATED = ['NONE', 'FERTILIZER', 'PESTICIDE', 'SEED'] as const;

// ---- Categories: GET/POST /product-categories, PATCH /:id (If-Match), POST /:id/merge, DELETE /:id (product.category.manage).
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  sortOrder?: number;
  defaultHsn: string | null;
  defaultTaxCode: string | null;
  batchRequired: boolean;
  expiryRequired: boolean;
  regulatedType: string;
  productCount: number;
  childCount: number;
  version: number;
}
const catLabel = (c: Category) => `${'- '.repeat(Math.max(0, c.level - 1))}${c.name}`;

function CategoryForm({ all, c, onDone }: { all: Category[]; c?: Category; onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const [name, setName] = useState(c?.name ?? '');
  const [parent, setParent] = useState(c?.parentId ?? '');
  const [hsn, setHsn] = useState(c?.defaultHsn ?? '');
  const [taxCode, setTaxCode] = useState(c?.defaultTaxCode ?? '');
  const [batch, setBatch] = useState(c?.batchRequired ?? false);
  const [expiry, setExpiry] = useState(c?.expiryRequired ?? false);
  const [reg, setReg] = useState(c?.regulatedType ?? 'NONE');
  const body = {
    name: name.trim(),
    parentId: parent || null,
    defaultHsn: blank(hsn) ?? null,
    defaultTaxCode: blank(taxCode) ?? null,
    batchRequired: batch,
    expiryRequired: expiry,
    regulatedType: reg,
  };
  return (
    <Card>
      <Field label={t('stkCat.name')} value={name} onChange={setName} />
      <Chips
        label={t('stkCat.parent')}
        options={[
          { id: '', label: t('stkCat.top') },
          ...all.filter((x) => x.id !== c?.id && x.level < 4).map((x) => ({ id: x.id, label: catLabel(x) })),
        ]}
        value={parent}
        onChange={setParent}
      />
      <Field label={t('stkCat.hsn')} value={hsn} onChange={setHsn} keyboard="numeric" />
      <Field label={t('stkCat.taxCode')} value={taxCode} onChange={setTaxCode} />
      <Check label={t('stkCat.batch')} value={batch} onChange={setBatch} />
      <Check label={t('stkCat.expiry')} value={expiry} onChange={setExpiry} />
      <Chips
        label={t('stkCat.regulated')}
        options={REGULATED.map((r) => ({ id: r as string, label: r }))}
        value={reg}
        onChange={setReg}
      />
      <Msgs w={w} />
      <Btn
        label={t('stkCat.save')}
        disabled={w.busy || name.trim().length < 2}
        onPress={() =>
          void (c
            ? w.patch(`/product-categories/${c.id}`, body, t('stkCat.saved'), {
                version: c.version,
                after: onDone,
              })
            : w.post('/product-categories', body, t('stkCat.saved'), { after: onDone }))
        }
      />
    </Card>
  );
}

export function CategoriesScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const [form, setForm] = useState<Category | 'new' | null>(null);
  const [merge, setMerge] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const manage = can('product.category.manage');
  return (
    <Page title={t('stkCat.title')} hint={t('stkCat.hint')} allowed={can('product.view')}>
      {manage ? <Btn label={t('stkCat.add')} onPress={() => setForm(form ? null : 'new')} /> : null}
      <Msgs w={w} />
      <Read<{ items: Category[] }> path="/product-categories">
        {(d) => (
          <>
            {form ? (
              <CategoryForm
                key={form === 'new' ? 'new' : form.id}
                all={d.items}
                c={form === 'new' ? undefined : form}
                onDone={() => setForm(null)}
              />
            ) : null}
            {d.items.length === 0 ? <Empty text={t('stkCat.empty')} /> : null}
            {d.items.map((c) => (
              <Card key={c.id}>
                <Text style={kit.name}>{catLabel(c)}</Text>
                <Text style={kit.sub}>
                  {[
                    t('stkCat.products', { count: c.productCount }),
                    c.batchRequired ? t('stkCat.batchShort') : null,
                    c.expiryRequired ? t('stkCat.expiryShort') : null,
                    c.regulatedType !== 'NONE' ? c.regulatedType : null,
                    c.defaultHsn ? `HSN ${c.defaultHsn}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {manage ? (
                  <View style={kit.row}>
                    <Btn kind="ghost" label={t('stkCat.edit')} onPress={() => setForm(c)} />
                    <Btn
                      kind="ghost"
                      label={t('stkCat.merge')}
                      onPress={() => {
                        setMerge(merge === c.id ? null : c.id);
                        setTarget('');
                      }}
                    />
                    {c.productCount === 0 && c.childCount === 0 ? (
                      <Btn
                        kind="ghost"
                        label={t('stkCat.delete')}
                        disabled={w.busy}
                        onPress={() =>
                          void w.del(`/product-categories/${c.id}`, undefined, t('stkCat.deleted'))
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
                {merge === c.id ? (
                  <>
                    <Text style={kit.sub}>{t('stkCat.mergeHint')}</Text>
                    <Chips
                      label={t('stkCat.target')}
                      options={d.items
                        .filter((x) => x.id !== c.id)
                        .map((x) => ({ id: x.id, label: catLabel(x) }))}
                      value={target}
                      onChange={setTarget}
                    />
                    <Btn
                      label={t('stkCat.mergeNow')}
                      disabled={w.busy || !target}
                      onPress={() =>
                        void w.post(
                          `/product-categories/${c.id}/merge`,
                          { targetId: target },
                          t('stkCat.merged'),
                          { after: () => setMerge(null) },
                        )
                      }
                    />
                  </>
                ) : null}
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Brands and manufacturers: GET/POST /brands, PATCH /brands/:id, GET/POST /manufacturers (product.brand.manage). A possible duplicate asks first.
interface Brand {
  id: string;
  name: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  registrationNo: string | null;
  productCount: number;
  status: string;
  version: number;
}
interface Maker {
  id: string;
  name: string;
  registrationNo: string | null;
  phone: string | null;
}

function BrandForm({ makers, b, onDone }: { makers: Maker[]; b?: Brand; onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const [name, setName] = useState(b?.name ?? '');
  const [maker, setMaker] = useState(b?.manufacturerId ?? '');
  const [reg, setReg] = useState(b?.registrationNo ?? '');
  const save = (confirm: boolean) => {
    const body = {
      name: name.trim(),
      manufacturerId: maker || null,
      registrationNo: blank(reg) ?? null,
      ...(confirm ? { confirmDuplicate: true } : {}),
    };
    return b
      ? w.patch(`/brands/${b.id}`, body, t('stkBrand.saved'), { version: b.version, after: onDone })
      : w.post('/brands', body, t('stkBrand.saved'), { after: onDone });
  };
  return (
    <Card>
      <Field label={t('stkBrand.name')} value={name} onChange={setName} />
      <Chips
        label={t('stkBrand.maker')}
        options={[
          { id: '', label: t('stkBrand.noMaker') },
          ...makers.map((m) => ({ id: m.id, label: m.name })),
        ]}
        value={maker}
        onChange={setMaker}
      />
      <Field label={t('stkBrand.reg')} value={reg} onChange={setReg} />
      <Msgs w={w} />
      {w.warn ? (
        <>
          <Notice tone="warn" text={t('stkBrand.duplicate')} />
          <Btn label={t('stkBrand.saveAnyway')} disabled={w.busy} onPress={() => void save(true)} />
        </>
      ) : null}
      <Btn
        label={t('stkBrand.save')}
        disabled={w.busy || name.trim().length < 2}
        onPress={() => void save(false)}
      />
    </Card>
  );
}

function MakerForm({ onDone }: { onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const [name, setName] = useState('');
  const [reg, setReg] = useState('');
  const [phone, setPhone] = useState('');
  const save = (confirm: boolean) =>
    w.post(
      '/manufacturers',
      {
        name: name.trim(),
        registrationNo: blank(reg) ?? null,
        phone: blank(phone) ?? null,
        ...(confirm ? { confirmDuplicate: true } : {}),
      },
      t('stkBrand.saved'),
      { after: onDone },
    );
  return (
    <Card>
      <Field label={t('stkBrand.makerName')} value={name} onChange={setName} />
      <Field label={t('stkBrand.reg')} value={reg} onChange={setReg} />
      <Field label={t('stkBrand.phone')} value={phone} onChange={setPhone} keyboard="phone-pad" />
      <Msgs w={w} />
      {w.warn ? (
        <>
          <Notice tone="warn" text={t('stkBrand.duplicate')} />
          <Btn label={t('stkBrand.saveAnyway')} disabled={w.busy} onPress={() => void save(true)} />
        </>
      ) : null}
      <Btn
        label={t('stkBrand.saveMaker')}
        disabled={w.busy || name.trim().length < 2}
        onPress={() => void save(false)}
      />
    </Card>
  );
}

export function BrandsScreen() {
  const { t, can } = useStk();
  const [form, setForm] = useState<Brand | 'new' | 'maker' | null>(null);
  const manage = can('product.brand.manage');
  return (
    <Page title={t('stkBrand.title')} allowed={can('product.view')}>
      {manage ? (
        <View style={kit.row}>
          <Btn label={t('stkBrand.add')} onPress={() => setForm(form === 'new' ? null : 'new')} />
          <Btn
            kind="ghost"
            label={t('stkBrand.addMaker')}
            onPress={() => setForm(form === 'maker' ? null : 'maker')}
          />
        </View>
      ) : null}
      <Read<{ items: Maker[] }> path="/manufacturers">
        {(m) => (
          <>
            {form === 'maker' ? <MakerForm onDone={() => setForm(null)} /> : null}
            {form && form !== 'maker' ? (
              <BrandFormLoader makers={m.items} form={form} onDone={() => setForm(null)} />
            ) : null}
            <Text style={kit.name}>{t('stkBrand.brands')}</Text>
            <Read<{ items: Brand[] }> path="/brands">
              {(b) => (
                <>
                  {b.items.length === 0 ? <Empty text={t('stkBrand.empty')} /> : null}
                  {b.items.map((x) => (
                    <Card key={x.id}>
                      <Text style={kit.name}>{x.name}</Text>
                      <Text style={kit.sub}>
                        {[
                          x.manufacturerName,
                          x.registrationNo,
                          t('stkCat.products', { count: x.productCount }),
                          x.status,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {manage ? (
                        <Btn
                          kind="ghost"
                          label={t('stkBrand.edit', { name: x.name })}
                          onPress={() => setForm(x)}
                        />
                      ) : null}
                    </Card>
                  ))}
                </>
              )}
            </Read>
            <Text style={kit.name}>{t('stkBrand.makers')}</Text>
            {m.items.map((x) => (
              <Card key={x.id}>
                <Text style={kit.name}>{x.name}</Text>
                <Text style={kit.sub}>{[x.registrationNo, x.phone].filter(Boolean).join(' · ')}</Text>
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}
const BrandFormLoader = ({
  makers,
  form,
  onDone,
}: {
  makers: Maker[];
  form: Brand | 'new';
  onDone: () => void;
}) => (
  <BrandForm
    key={form === 'new' ? 'new' : form.id}
    makers={makers}
    b={form === 'new' ? undefined : form}
    onDone={onDone}
  />
);

// ---- Units of measure: GET/POST /uoms (product.uom.manage). Stock is always kept in the product base unit.
interface Uom {
  id: string;
  code: string;
  name: string;
  precision: number;
  active: boolean;
}
export const validUnit = (code: string, name: string, precision: string): boolean =>
  /^[A-Za-z0-9._-]{1,12}$/.test(code.trim()) && name.trim().length > 0 && /^[0-6]$/.test(precision.trim());

export function UnitsScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [prec, setPrec] = useState('3');
  return (
    <Page title={t('stkUnits.title')} hint={t('stkUnits.hint')} allowed={can('product.view')}>
      {can('product.uom.manage') ? <Btn label={t('stkUnits.add')} onPress={() => setOpen(!open)} /> : null}
      {open ? (
        <Card>
          <Field label={t('stkUnits.code')} value={code} onChange={setCode} />
          <Field label={t('stkUnits.name')} value={name} onChange={setName} />
          <Field
            label={t('stkUnits.precision')}
            value={prec}
            onChange={setPrec}
            keyboard="numeric"
            error={validUnit('A', 'a', prec) ? null : t('stkUnits.badPrecision')}
          />
          <Msgs w={w} />
          <Btn
            label={t('stkUnits.save')}
            disabled={w.busy || !validUnit(code, name, prec)}
            onPress={() =>
              void w.post(
                '/uoms',
                { code: code.trim(), name: name.trim(), precision: Number(prec) },
                t('stkUnits.saved'),
                {
                  after: () => {
                    setOpen(false);
                    setCode('');
                    setName('');
                  },
                },
              )
            }
          />
        </Card>
      ) : (
        <Msgs w={w} />
      )}
      <Read<{ items: Uom[] }> path="/uoms">
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkUnits.empty')} /> : null}
            {d.items.map((u) => (
              <Card key={u.id}>
                <Text style={kit.name}>
                  {u.code} · {u.name}
                </Text>
                <Text style={kit.sub}>
                  {t('stkUnits.places', { count: u.precision })} ·{' '}
                  {u.active ? t('stkUnits.active') : t('stkUnits.inactive')}
                </Text>
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Price lists: GET/POST /price-lists, GET /:id, PUT /:id/items, POST /:id/publish|end|revise, DELETE /:id (pricing.manage). Assignments are NOT edited here.
interface PriceList {
  id: string;
  code: string;
  name: string;
  kind: string;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED';
  itemCount?: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: number;
}
interface PriceListFull extends PriceList {
  items: {
    code: string;
    name: string;
    price: string | null;
    adjustPct: string | null;
    effectivePrice: string | null;
    mrp: string | null;
  }[];
  assignments: unknown[];
}
const KINDS = ['RETAIL', 'WHOLESALE', 'DEALER', 'SPECIAL'] as const;
const NUM = /^\d{1,12}(\.\d{1,4})?$/;
const PCT = /^-?\d{1,3}(\.\d{1,4})?$/;

/** "CODE, 1200" or "CODE, -5%" per line. Returns a code with price or percent, or the first bad line number. */
export function parseListLines(
  text: string,
): { rows: { code: string; price?: string; adjustPct?: string }[] } | { badLine: number } {
  const rows: { code: string; price?: string; adjustPct?: string }[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const [i, ln] of lines.entries()) {
    const [code, val] = ln.split(',').map((s) => s.trim());
    if (!code || !val) return { badLine: i + 1 };
    if (val.endsWith('%')) {
      const p = val.slice(0, -1).trim();
      if (!PCT.test(p)) return { badLine: i + 1 };
      rows.push({ code, adjustPct: p });
    } else {
      if (!NUM.test(val)) return { badLine: i + 1 };
      rows.push({ code, price: val });
    }
  }
  return { rows };
}

function ListLines({ x, onDone }: { x: PriceListFull; onDone: () => void }) {
  const { t, client } = useStk();
  const w = useWrite();
  const [text, setText] = useState(
    x.items.map((i) => `${i.code}, ${i.price ?? `${i.adjustPct}%`}`).join('\n'),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const parsed = parseListLines(text);
  async function save() {
    if (!('rows' in parsed)) return;
    setProblem(null);
    try {
      const items: { skuId: string; price?: string; adjustPct?: string }[] = [];
      for (const r of parsed.rows) {
        const f = await client!.get<{ items: { id: string; code: string }[] }>('/products', {
          query: { q: r.code, limit: 20 },
        });
        const p = f.items.find((i) => i.code.toLowerCase() === r.code.toLowerCase());
        if (!p) {
          setProblem(t('stkPrice.noProduct', { code: r.code }));
          return;
        }
        items.push({
          skuId: p.id,
          ...(r.price !== undefined ? { price: r.price } : { adjustPct: r.adjustPct }),
        });
      }
      await w.put(`/price-lists/${x.id}/items`, { items }, t('stkPrice.linesSaved'), {
        version: x.version,
        after: onDone,
      });
    } catch (e) {
      setProblem(
        e instanceof ApiError
          ? t('stkPrice.lookupFailed', { code: e.code })
          : t('stkPrice.lookupFailed', { code: 'ERROR' }),
      );
    }
  }
  return (
    <Card>
      <Text style={kit.sub}>{t('stkPrice.linesHint')}</Text>
      <Area label={t('stkPrice.lines')} value={text} onChange={setText} />
      {'badLine' in parsed ? (
        <Text style={tone.error}>{t('stkPrice.badLine', { n: parsed.badLine })}</Text>
      ) : null}
      {problem ? <Text style={tone.error}>{problem}</Text> : null}
      <Msgs w={w} />
      <Btn
        label={t('stkPrice.saveLines')}
        disabled={w.busy || !('rows' in parsed)}
        onPress={() => void save()}
      />
    </Card>
  );
}

function ListDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [mode, setMode] = useState<'lines' | 'publish' | 'end' | null>(null);
  const [day, setDay] = useState(today());
  const manage = can('pricing.manage');
  return (
    <Read<PriceListFull> path={`/price-lists/${id}`}>
      {(x) => {
        const draft = x.status === 'DRAFT';
        return (
          <>
            <Btn kind="ghost" label={t('stkPrice.back')} onPress={onBack} />
            <Card>
              <Text style={kit.name}>
                {x.code} r{x.revision} · {x.name}
              </Text>
              <Text style={kit.sub}>
                {[
                  t(`stkPrice.status_${x.status}`),
                  x.kind,
                  x.effectiveFrom
                    ? `${shortDate(x.effectiveFrom)} - ${x.effectiveTo ? shortDate(x.effectiveTo) : t('stkPrice.open')}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={kit.sub}>{t('stkPrice.assigned', { count: x.assignments.length })}</Text>
            </Card>
            <Msgs w={w} />
            {manage ? (
              <View style={kit.row}>
                {draft ? (
                  <Btn
                    kind="ghost"
                    label={t('stkPrice.editLines')}
                    onPress={() => setMode(mode === 'lines' ? null : 'lines')}
                  />
                ) : null}
                {draft ? <Btn label={t('stkPrice.publish')} onPress={() => setMode('publish')} /> : null}
                {!draft ? (
                  <Btn
                    kind="ghost"
                    label={t('stkPrice.revise')}
                    disabled={w.busy}
                    onPress={() =>
                      void w.post(`/price-lists/${x.id}/revise`, {}, t('stkPrice.revised'), { after: onBack })
                    }
                  />
                ) : null}
                {x.status === 'PUBLISHED' ? (
                  <Btn kind="ghost" label={t('stkPrice.end')} onPress={() => setMode('end')} />
                ) : null}
                {draft ? (
                  <Btn
                    kind="ghost"
                    label={t('stkPrice.deleteDraft')}
                    disabled={w.busy}
                    onPress={() =>
                      void w.del(`/price-lists/${x.id}`, undefined, t('stkPrice.deleted'), { after: onBack })
                    }
                  />
                ) : null}
              </View>
            ) : null}
            {mode === 'lines' ? <ListLines x={x} onDone={() => setMode(null)} /> : null}
            {mode === 'publish' || mode === 'end' ? (
              <Card>
                <Text style={kit.sub}>
                  {mode === 'publish' ? t('stkPrice.publishHint') : t('stkPrice.endHint')}
                </Text>
                <Field
                  label={mode === 'publish' ? t('stkPrice.from') : t('stkPrice.lastDay')}
                  value={day}
                  onChange={setDay}
                  placeholder="YYYY-MM-DD"
                  error={validDay(day) ? null : t('stk.badDate')}
                />
                <Btn
                  label={mode === 'publish' ? t('stkPrice.publishNow') : t('stkPrice.endNow')}
                  disabled={w.busy || !validDay(day)}
                  onPress={() =>
                    void (mode === 'publish'
                      ? w.post(
                          `/price-lists/${x.id}/publish`,
                          { effectiveFrom: day.trim() },
                          t('stkPrice.published'),
                          { version: x.version, after: () => setMode(null) },
                        )
                      : w.post(`/price-lists/${x.id}/end`, { effectiveTo: day.trim() }, t('stkPrice.ended'), {
                          version: x.version,
                          after: () => setMode(null),
                        }))
                  }
                />
              </Card>
            ) : null}
            {x.items.length === 0 ? <Empty text={t('stkPrice.noLines')} /> : null}
            {x.items.map((i) => (
              <Card key={i.code}>
                <Text style={kit.name}>
                  {i.code} {i.name}
                </Text>
                <Line
                  label={i.price !== null ? t('stkPrice.price') : t('stkPrice.percent')}
                  value={i.price !== null ? formatINR(i.price) : `${i.adjustPct}%`}
                />
                {i.effectivePrice !== null ? (
                  <Line label={t('stkPrice.comesTo')} value={formatINR(i.effectivePrice)} strong />
                ) : null}
                {i.mrp !== null ? <Line label={t('stkPrice.mrp')} value={formatINR(i.mrp)} /> : null}
              </Card>
            ))}
          </>
        );
      }}
    </Read>
  );
}

export function PriceListsScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('RETAIL');
  return (
    <Page title={t('stkPrice.title')} hint={t('stkPrice.hint')} allowed={can('product.view')}>
      {open ? (
        <ListDetail id={open} onBack={() => setOpen(null)} />
      ) : (
        <>
          {can('pricing.manage') ? <Btn label={t('stkPrice.new')} onPress={() => setForm(!form)} /> : null}
          {form ? (
            <Card>
              <Field label={t('stkPrice.code')} value={code} onChange={setCode} />
              <Field label={t('stkPrice.name')} value={name} onChange={setName} />
              <Chips
                label={t('stkPrice.kind')}
                options={KINDS.map((k) => ({ id: k as string, label: k }))}
                value={kind}
                onChange={setKind}
              />
              <Msgs w={w} />
              <Btn
                label={t('stkPrice.create')}
                disabled={w.busy || !code.trim() || !name.trim()}
                onPress={() =>
                  void w.post(
                    '/price-lists',
                    { code: code.trim(), name: name.trim(), kind },
                    t('stkPrice.created'),
                    {
                      after: () => {
                        setForm(false);
                        setCode('');
                        setName('');
                      },
                    },
                  )
                }
              />
            </Card>
          ) : (
            <Msgs w={w} />
          )}
          <Read<{ items: PriceList[] }> path="/price-lists">
            {(d) => (
              <>
                {d.items.length === 0 ? <Empty text={t('stkPrice.empty')} /> : null}
                {d.items.map((l) => (
                  <Card key={l.id}>
                    <Text style={kit.name}>
                      {l.code} r{l.revision} · {l.name}
                    </Text>
                    <Text style={kit.sub}>
                      {[
                        l.kind,
                        t(`stkPrice.status_${l.status}`),
                        l.itemCount !== undefined ? t('stkPrice.lineCount', { count: l.itemCount }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Btn
                      kind="ghost"
                      label={t('stkPrice.open_', { code: l.code })}
                      onPress={() => setOpen(l.id)}
                    />
                  </Card>
                ))}
              </>
            )}
          </Read>
        </>
      )}
    </Page>
  );
}

// ---- Products with no HSN: GET /products/missing-hsn. Must be empty before go-live. Bulk tax update is NOT built here.
export function MissingHsnScreen() {
  const { t, can } = useStk();
  return (
    <Page title={t('stkHsn.title')} hint={t('stkHsn.hint')} allowed={can('product.view')}>
      <Read<{
        total: number;
        items: { id: string; code: string; name: string; categoryName: string | null }[];
      }> path="/products/missing-hsn">
        {(d) => (
          <>
            <Text style={kit.name}>{t('stkHsn.total', { count: d.total })}</Text>
            {d.items.length === 0 ? <Empty text={t('stkHsn.none')} /> : null}
            {d.items.map((p) => (
              <Card key={p.id}>
                <Text style={kit.name}>
                  {p.code} {p.name}
                </Text>
                <Text style={kit.sub}>{p.categoryName ?? '-'}</Text>
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}
