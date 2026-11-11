import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Notice, kit } from '@/ui/kit';
import { ActionForm, Denied, Loaded, Row, Tabs, itemsOf, s, useCan, useFailureText, useGet, useOneShot, useRefresh, type FieldDef, type Values } from '../inventory/kit';

export const MASTER_PERM = { view: 'product.view', category: 'product.category.manage', brand: 'product.brand.manage', uom: 'product.uom.manage' } as const;
const REGULATED = ['NONE', 'FERTILIZER', 'PESTICIDE', 'SEED'];

interface Cat {
  id: string;
  version: number;
  name: string;
  parentId: string | null;
  level: number;
  sortOrder?: number | null;
  defaultHsn: string | null;
  defaultTaxCode: string | null;
  batchRequired: boolean;
  expiryRequired: boolean;
  regulatedType: string;
  productCount: number;
  childCount: number;
}
interface Brand {
  id: string;
  version: number;
  name: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  registrationNo: string | null;
  marketingCompany?: string | null;
  contactName?: string | null;
  productCount: number;
  status: string;
}
interface Man {
  id: string;
  name: string;
  registrationNo: string | null;
  phone: string | null;
}
interface Uom {
  id: string;
  code: string;
  name: string;
  precision: number;
  active: boolean;
}
type Tab = 'categories' | 'brands' | 'uoms';
type Act =
  | { k: 'cat'; row?: Cat }
  | { k: 'merge'; row: Cat }
  | { k: 'brand'; row?: Brand }
  | { k: 'man' }
  | { k: 'uom' };

const nz = (v: string | boolean | undefined) => (String(v ?? '').trim() === '' ? null : String(v).trim());

export default function MastersScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const failText = useFailureText();
  const [tab, setTab] = useState<Tab>('categories');
  const [act, setAct] = useState<Act | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = can(MASTER_PERM.view);
  const cats = useGet<{ items: Cat[] }>('/product-categories', {}, ok);
  const brands = useGet<{ items: Brand[] }>('/brands', {}, ok && tab === 'brands');
  const mans = useGet<{ items: Man[] }>('/manufacturers', {}, ok && tab === 'brands');
  const uoms = useGet<{ items: Uom[] }>('/uoms', {}, ok && tab === 'uoms');
  const done = () => {
    setMsg(t('products.saved'));
    setAct(null);
    refresh();
  };
  const one = useOneShot(done);
  if (!ok) return <Denied text={t('products.denied')} />;
  const catList = itemsOf(cats.data);
  const manList = itemsOf(mans.data);

  function form(a: Act): { title: string; fields: FieldDef[]; initial?: Values; send: (v: Values, key: string, x: Record<string, boolean>) => Promise<unknown> } {
    const g = (v: Values, k: string) => String(v[k] ?? '').trim();
    if (a.k === 'cat') {
      const c = a.row;
      return {
        title: c ? t('masters.editCategory', { name: c.name }) : t('masters.newCategory'),
        initial: c ? { name: c.name, parentId: c.parentId ?? '', defaultHsn: c.defaultHsn ?? '', defaultTaxCode: c.defaultTaxCode ?? '', batchRequired: c.batchRequired, expiryRequired: c.expiryRequired, regulatedType: c.regulatedType } : { regulatedType: 'NONE' },
        fields: [
          { name: 'name', label: t('masters.name'), kind: 'text', required: true },
          { name: 'parentId', label: t('masters.parent'), kind: 'choice', options: catList.filter((x) => x.id !== c?.id).map((x) => ({ id: x.id, label: `${'- '.repeat(Math.max(0, x.level - 1))}${x.name}` })) },
          { name: 'defaultHsn', label: t('masters.defaultHsn'), kind: 'text' },
          { name: 'defaultTaxCode', label: t('masters.defaultTax'), kind: 'text' },
          { name: 'batchRequired', label: t('products.batchTracked'), kind: 'bool' },
          { name: 'expiryRequired', label: t('products.expiryTracked'), kind: 'bool' },
          { name: 'regulatedType', label: t('products.regulated'), kind: 'choice', required: true, options: REGULATED.map((r) => ({ id: r, label: t(`masters.reg.${r}`) })) },
        ],
        send: (v, key) => {
          const body = { name: g(v, 'name'), parentId: nz(v.parentId), defaultHsn: nz(v.defaultHsn), defaultTaxCode: nz(v.defaultTaxCode), batchRequired: v.batchRequired === true, expiryRequired: v.expiryRequired === true, regulatedType: v.regulatedType };
          return c ? client!.patch(`/product-categories/${c.id}`, { body, version: c.version, idempotencyKey: key }) : client!.post('/product-categories', { body, idempotencyKey: key });
        },
      };
    }
    if (a.k === 'merge')
      return {
        title: t('masters.mergeTitle', { name: a.row.name }),
        fields: [{ name: 'targetId', label: t('masters.target'), kind: 'choice', required: true, options: catList.filter((x) => x.id !== a.row.id).map((x) => ({ id: x.id, label: x.name })) }],
        send: (v, key) => client!.post(`/product-categories/${a.row.id}/merge`, { body: { targetId: v.targetId }, idempotencyKey: key }),
      };
    if (a.k === 'brand') {
      const b = a.row;
      return {
        title: b ? t('masters.editBrand', { name: b.name }) : t('masters.newBrand'),
        initial: b ? { name: b.name, manufacturerId: b.manufacturerId ?? '', marketingCompany: b.marketingCompany ?? '', contactName: b.contactName ?? '', registrationNo: b.registrationNo ?? '' } : undefined,
        fields: [
          { name: 'name', label: t('masters.brandName'), kind: 'text', required: true },
          { name: 'manufacturerId', label: t('masters.manufacturer'), kind: 'choice', options: manList.map((m) => ({ id: m.id, label: m.name })) },
          { name: 'marketingCompany', label: t('masters.marketing'), kind: 'text' },
          { name: 'contactName', label: t('masters.contact'), kind: 'text' },
          { name: 'registrationNo', label: t('masters.registration'), kind: 'text' },
        ],
        send: (v, key, x) => {
          const body: Record<string, unknown> = { name: g(v, 'name'), marketingCompany: nz(v.marketingCompany), contactName: nz(v.contactName), registrationNo: nz(v.registrationNo), ...x };
          if (g(v, 'manufacturerId')) body.manufacturerId = g(v, 'manufacturerId');
          return b ? client!.patch(`/brands/${b.id}`, { body, version: b.version, idempotencyKey: key }) : client!.post('/brands', { body, idempotencyKey: key });
        },
      };
    }
    if (a.k === 'man')
      return {
        title: t('masters.newManufacturer'),
        fields: [
          { name: 'name', label: t('masters.name'), kind: 'text', required: true },
          { name: 'registrationNo', label: t('masters.registration'), kind: 'text' },
          { name: 'phone', label: t('masters.phone'), kind: 'text' },
        ],
        send: (v, key, x) => client!.post('/manufacturers', { body: { name: g(v, 'name'), registrationNo: nz(v.registrationNo), phone: nz(v.phone), ...x }, idempotencyKey: key }),
      };
    return {
      title: t('masters.newUnit'),
      fields: [
        { name: 'code', label: t('masters.code'), kind: 'text', required: true },
        { name: 'name', label: t('masters.name'), kind: 'text', required: true },
        { name: 'precision', label: t('masters.precision'), kind: 'int', required: true },
      ],
      initial: { precision: '3' },
      send: (v, key) => client!.post('/uoms', { body: { code: g(v, 'code'), name: g(v, 'name'), precision: Number(g(v, 'precision')) }, idempotencyKey: key }),
    };
  }

  const fm = act ? form(act) : null;
  const precisionBad = (v: Values) => (act?.k === 'uom' && Number(String(v.precision)) > 6 ? 'masters.precisionMax' : null);

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('masters.title')}
      </Text>
      <Tabs
        label={t('masters.title')}
        value={tab}
        onChange={(x) => {
          setTab(x);
          setAct(null);
        }}
        tabs={(['categories', 'brands', 'uoms'] as const).map((x) => ({ id: x, label: t(`masters.tabs.${x}`) }))}
      />
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {one.failure ? <Notice tone="error" text={failText(one.failure)} /> : null}
      {fm && act ? (
        <ActionForm
          key={`${act.k}:${'row' in act && act.row ? act.row.id : 'new'}`}
          title={fm.title}
          fields={fm.fields}
          initial={fm.initial}
          submitLabel={t('products.save')}
          extraCheck={precisionBad}
          onCancel={() => setAct(null)}
          onDone={done}
          send={fm.send}
        />
      ) : null}

      {tab === 'categories' ? (
        <>
          {can(MASTER_PERM.category) && !act ? <Button label={t('masters.newCategory')} onPress={() => setAct({ k: 'cat' })} /> : null}
          <Loaded q={cats} empty={t('masters.noCategories')} isEmpty={catList.length === 0} offlineKey="products.offline">
            {catList.map((c) => (
              <Row
                key={c.id}
                title={`${'- '.repeat(Math.max(0, c.level - 1))}${c.name}`}
                lines={[
                  [c.batchRequired && t('products.batchTracked'), c.expiryRequired && t('products.expiryTracked'), c.regulatedType !== 'NONE' && c.regulatedType, c.defaultHsn && `HSN ${c.defaultHsn}`].filter(Boolean).join(', '),
                  t('masters.productCount', { count: c.productCount }),
                ]}
              >
                {can(MASTER_PERM.category) ? (
                  <>
                    <Button kind="ghost" label={t('masters.edit')} onPress={() => setAct({ k: 'cat', row: c })} />
                    <Button kind="ghost" label={t('masters.merge')} onPress={() => setAct({ k: 'merge', row: c })} />
                    {c.productCount === 0 && c.childCount === 0 ? (
                      <Button kind="ghost" label={t('masters.delete', { name: c.name })} disabled={one.busy} onPress={() => void one.run(`del:${c.id}`, (key) => client!.delete(`/product-categories/${c.id}`, { idempotencyKey: key }))} />
                    ) : null}
                  </>
                ) : null}
              </Row>
            ))}
          </Loaded>
        </>
      ) : null}

      {tab === 'brands' ? (
        <>
          {can(MASTER_PERM.brand) && !act ? (
            <>
              <Button label={t('masters.newBrand')} onPress={() => setAct({ k: 'brand' })} />
              <Button kind="ghost" label={t('masters.newManufacturer')} onPress={() => setAct({ k: 'man' })} />
            </>
          ) : null}
          <Loaded q={brands} empty={t('masters.noBrands')} isEmpty={itemsOf(brands.data).length === 0} offlineKey="products.offline">
            {itemsOf(brands.data).map((b) => (
              <Row key={b.id} title={b.name} lines={[b.manufacturerName ?? '-', b.registrationNo ?? '', t('masters.productCount', { count: b.productCount })]}>
                {can(MASTER_PERM.brand) ? <Button kind="ghost" label={t('masters.edit')} onPress={() => setAct({ k: 'brand', row: b })} /> : null}
              </Row>
            ))}
          </Loaded>
          <Text style={kit.name}>{t('masters.manufacturers')}</Text>
          {manList.map((m) => (
            <Row key={m.id} title={m.name} lines={[m.registrationNo ?? '', m.phone ?? '']} />
          ))}
        </>
      ) : null}

      {tab === 'uoms' ? (
        <>
          <Text style={kit.sub}>{t('masters.uomHint')}</Text>
          {can(MASTER_PERM.uom) && !act ? <Button label={t('masters.newUnit')} onPress={() => setAct({ k: 'uom' })} /> : null}
          <Loaded q={uoms} empty={t('masters.noUnits')} isEmpty={itemsOf(uoms.data).length === 0} offlineKey="products.offline">
            {itemsOf(uoms.data).map((u) => (
              <Row key={u.id} title={`${u.code} · ${u.name}`} lines={[t('masters.precisionLine', { count: u.precision }), u.active ? t('products.status.ACTIVE') : t('products.status.INACTIVE')]} />
            ))}
          </Loaded>
        </>
      ) : null}
    </ScrollView>
  );
}
