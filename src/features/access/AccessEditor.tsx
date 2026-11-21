import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { useFailureText } from '../hr/kit';
import {
  buildTree,
  changes,
  codesOf,
  featureName,
  matches,
  setMany,
  setOne,
  slug,
  stateOf,
  type CatalogueItem,
  type Show,
} from './access-logic';

/**
 * The Access control editor of the web: the menus with a switch each, then pages and single features, with a search, an All / On / Off
 * filter and a save bar. The same editor sets what a franchise may use (platform) and what one person may use (franchise admin).
 * The app only shows and sends; the server decides what is allowed.
 */
export function AccessEditor({
  catalogue,
  effective,
  origin = () => '',
  lockedWhy = () => null,
  title,
  subtitle,
  badge,
  note,
  initialMenu = 'Operations',
  onSave,
  onSaved,
}: {
  catalogue: CatalogueItem[];
  effective: string[];
  origin?: (p: CatalogueItem) => string;
  lockedWhy?: (p: CatalogueItem) => string | null;
  title: string;
  subtitle: string;
  badge?: { text: string; tone: 'ok' | 'warn' | 'off' } | null;
  note?: string | null;
  initialMenu?: string;
  onSave: (codes: string[], key: string) => Promise<void>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const failText = useFailureText();
  const keys = useActionKey();
  const was = useMemo(() => new Set(effective), [effective]);
  const tree = useMemo(() => buildTree(catalogue), [catalogue]);
  const byCode = useMemo(() => new Map(catalogue.map((p) => [p.code, p])), [catalogue]);
  const total = catalogue.filter((p) => p.enabled).length;
  const [draft, setDraft] = useState<Set<string>>(new Set(effective));
  const [menu, setMenu] = useState(initialMenu);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const name = (s: string) => t(`wp34.names.${slug(s)}`, { defaultValue: s });

  const n = changes(draft, was);
  const dirty = n.added + n.removed > 0;
  const menus = [...tree.entries()].filter(([, pages]) => pages.size > 0);
  const openMenu = tree.get(menu)?.size ? menu : (menus[0]?.[0] ?? menu);
  const pages = tree.get(openMenu) ?? new Map<string, CatalogueItem[]>();
  const on = [...draft].filter((c) => byCode.get(c)?.enabled).length;

  const change = (codes: string[], v: boolean) => setDraft(setMany(draft, codes, v, byCode, lockedWhy));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const codes = [...draft].sort();
      await onSave(codes, keys.keyFor(codes.join(',')));
      keys.reset();
      setSaved(true);
      onSaved();
    } catch (e) {
      setFailure(failText(e));
    } finally {
      setBusy(false);
    }
  };

  const cards = [...pages.entries()]
    .map(([pg, perms]) => ({ pg, perms, shown: perms.filter((p) => matches(p, pg, q, show, draft)) }))
    .filter((c) => c.shown.length > 0);

  return (
    <>
      <Card>
        <Text style={kit.name} accessibilityRole="header">
          {title}
        </Text>
        <Text style={kit.sub}>{t('wp34.subtitle', { sub: subtitle, on, total })}</Text>
        {badge ? <Notice tone={badge.tone === 'ok' ? 'ok' : 'warn'} text={badge.text} /> : null}
        {note ? <Text style={kit.sub}>{note}</Text> : null}
      </Card>
      <Chips
        label={t('wp34.menus')}
        options={menus.map(([m, p]) => {
          const s = stateOf(codesOf(p), draft);
          return { id: m, label: `${name(m)} ${s.n}/${codesOf(p).length}` };
        })}
        value={openMenu}
        onChange={setMenu}
      />
      {menus.length > 0 ? (
        <Switch
          label={t('wp34.wholeMenu', { menu: name(openMenu) })}
          state={stateOf(codesOf(pages), draft)}
          disabled={codesOf(pages).every((c) => lockedWhy(byCode.get(c)!))}
          onChange={(v) => change(codesOf(pages), v)}
        />
      ) : null}
      <Field label={t('wp34.search')} value={q} onChange={setQ} placeholder={t('wp34.searchHint')} />
      <Chips
        label={t('wp34.showFeatures')}
        options={(['all', 'on', 'off'] as Show[]).map((k) => ({ id: k, label: t(`wp34.show.${k}`) }))}
        value={show}
        onChange={setShow}
      />
      {cards.length === 0 ? <Text style={kit.sub}>{t('wp34.none')}</Text> : null}
      {cards.map(({ pg, perms, shown }) => {
        const codes = perms.map((p) => p.code);
        return (
          <Card key={pg}>
            <Text style={kit.name}>
              {name(pg)} · {stateOf(codes, draft).n}/{codes.length}
            </Text>
            <Switch
              label={t('wp34.wholePage', { page: name(pg) })}
              state={stateOf(codes, draft)}
              disabled={codes.every((c) => lockedWhy(byCode.get(c)!))}
              onChange={(v) => change(codes, v)}
            />
            {shown.map((p) => {
              const why = lockedWhy(p);
              const from = origin(p);
              return (
                <Switch
                  key={p.code}
                  label={`${name(pg)}: ${featureName(p.code)}`}
                  text={featureName(p.code)}
                  sub={[p.description ?? p.code, from].filter(Boolean).join(' · ')}
                  state={{ all: draft.has(p.code), some: false }}
                  disabled={Boolean(why)}
                  why={why}
                  changed={draft.has(p.code) !== was.has(p.code)}
                  onChange={(v) => setDraft(setOne(draft, p.code, v))}
                />
              );
            })}
          </Card>
        );
      })}
      {saved && !dirty ? <Notice tone="ok" text={t('wp34.saved')} /> : null}
      {failure ? <Notice tone="error" text={failure} /> : null}
      {dirty ? (
        <Card>
          <Text style={kit.sub}>{t('wp34.unsaved', { added: n.added, removed: n.removed })}</Text>
          <View style={kit.row}>
            <Button label={t('wp34.save')} disabled={busy} onPress={() => void save()} />
            <Button
              kind="ghost"
              label={t('wp34.discard')}
              disabled={busy}
              onPress={() => (setDraft(new Set(effective)), setFailure(null))}
            />
          </View>
        </Card>
      ) : null}
    </>
  );
}

/** One switch: on, off, or "some" for a menu or a page that is only partly on. A locked one says why. */
function Switch({
  label,
  text,
  sub,
  state,
  disabled,
  why,
  changed,
  onChange,
}: {
  label: string;
  text?: string;
  sub?: string;
  state: { all: boolean; some: boolean };
  disabled?: boolean;
  why?: string | null;
  changed?: boolean;
  onChange: (v: boolean) => void;
}) {
  const mark = state.all ? '☑' : state.some ? '▣' : '☐';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: state.some ? 'mixed' : state.all, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!state.all)}
      style={[s.row, changed ? s.changed : null, disabled ? s.locked : null]}
    >
      <Text style={s.mark}>{mark}</Text>
      <View style={s.text}>
        <Text style={kit.name}>{text ?? label}</Text>
        {sub ? <Text style={kit.sub}>{sub}</Text> : null}
        {why ? <Text style={kit.sub}>{why}</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  mark: { fontSize: 20, color: colors.ink },
  text: { flex: 1 },
  changed: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 6 },
  locked: { opacity: 0.55 },
});
