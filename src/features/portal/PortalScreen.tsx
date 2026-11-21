import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { newId } from '@/device';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { colors, lineStrong, radius, surface } from '@/ui/theme';
import {
  CODE_RE,
  MOBILE_RE,
  SHOP_RE,
  clearPortalToken,
  fetchPayLink,
  fetchPortal,
  loadPortalToken,
  portalLogout,
  requestCode,
  savePortalToken,
  verifyCode,
} from './api';

type Data = Awaited<ReturnType<typeof fetchPortal>>;

export default function PortalScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ f?: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [shop, setShop] = useState(typeof params.f === 'string' ? params.f : '');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [payLink, setPayLink] = useState<{ amount: string; link: string } | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef<{ k: string; fp: string } | null>(null);
  const keyFor = (fp: string) => {
    if (!key.current || key.current.fp !== fp) key.current = { k: newId(), fp };
    return key.current.k;
  };

  async function load(tk: string) {
    setBusy(true);
    setFailure(null);
    try {
      setData(await fetchPortal(tk));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearPortalToken();
        setToken(null);
        setData(null);
      }
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    void loadPortalToken().then((tk) => {
      if (!live) return;
      setToken(tk);
      setBooting(false);
      if (tk) void load(tk);
    });
    return () => {
      live = false;
    };
  }, []);

  const shopOk = SHOP_RE.test(shop.trim());
  const mobileOk = MOBILE_RE.test(mobile.trim());

  async function ask() {
    if (busy || !shopOk || !mobileOk) return;
    setBusy(true);
    setFailure(null);
    try {
      const r = await requestCode(shop.trim(), mobile.trim(), keyFor(`otp:${shop}:${mobile}`));
      key.current = null;
      setDevCode(r?.devCode ?? null);
      setSent(true);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy || !CODE_RE.test(code.trim())) return;
    setBusy(true);
    setFailure(null);
    try {
      const r = await verifyCode(shop.trim(), mobile.trim(), code.trim(), keyFor(`v:${shop}:${mobile}:${code}`));
      key.current = null;
      await savePortalToken(r.token);
      setToken(r.token);
      setCode('');
      setSent(false);
      await load(r.token);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    const tk = token;
    await clearPortalToken();
    setToken(null);
    setData(null);
    setPayLink(null);
    setSent(false);
    if (tk) await portalLogout(tk).catch(() => null); // the phone is already signed out; the server session ends best effort
  }
  async function pay() {
    if (!token || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      setPayLink(await fetchPayLink(token));
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const error = failure ? (
    <Text style={s.error} accessibilityRole="alert">
      {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
    </Text>
  ) : null;

  if (booting) return <Text style={s.sub}>{t('common.loading')}</Text>;

  if (!token) {
    return (
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.title} accessibilityRole="header">
          {t('wp25.title')}
        </Text>
        <Text style={s.sub}>{t('wp25.intro')}</Text>
        <TextInput
          value={shop}
          onChangeText={setShop}
          placeholder={t('wp25.shop')}
          accessibilityLabel={t('wp25.shop')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!sent}
          style={s.input}
        />
        <TextInput
          value={mobile}
          onChangeText={setMobile}
          placeholder={t('wp25.mobile')}
          accessibilityLabel={t('wp25.mobile')}
          keyboardType="number-pad"
          maxLength={10}
          editable={!sent}
          style={s.input}
        />
        {mobile !== '' && !mobileOk ? <Text style={s.error}>{t('wp25.v.mobile')}</Text> : null}
        {sent ? (
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={t('wp25.code')}
            accessibilityLabel={t('wp25.code')}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="sms-otp"
            style={s.input}
          />
        ) : null}
        {devCode ? <Text style={s.sub}>{t('wp25.devCode', { code: devCode })}</Text> : null}
        {error}
        {sent ? (
          <>
            <Button label={t('wp25.signIn')} disabled={busy || !CODE_RE.test(code.trim())} onPress={() => void verify()} />
            <Button
              kind="ghost"
              label={t('wp25.again')}
              onPress={() => {
                setSent(false);
                setCode('');
                setFailure(null);
              }}
            />
          </>
        ) : (
          <Button label={t('wp25.send')} disabled={busy || !shopOk || !mobileOk} onPress={() => void ask()} />
        )}
      </ScrollView>
    );
  }

  if (!data) {
    return (
      <View style={s.page}>
        <Text style={s.sub}>{busy ? t('common.loading') : t('wp25.loadFailed')}</Text>
        {error}
        <Button kind="ghost" label={t('common.retry')} onPress={() => void load(token)} />
        <Button kind="ghost" label={t('wp25.signOut')} onPress={() => void signOut()} />
      </View>
    );
  }

  const owed = dec(data.outstanding);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title} accessibilityRole="header">
        {t('wp25.title')}
      </Text>
      <Text style={s.name}>
        {data.me.name} ({data.me.code}){data.me.shop ? ` - ${data.me.shop}` : ''}
      </Text>
      {error}

      <View style={s.card}>
        <Text style={s.name}>{t('wp25.dues')}</Text>
        <Text style={s.sub}>
          {owed.gt(0) ? t('wp25.owe', { amount: formatINR(data.outstanding) }) : t('wp25.noDues')}
        </Text>
        {owed.gt(0) ? <Button label={t('wp25.pay')} disabled={busy} onPress={() => void pay()} /> : null}
        {payLink ? (
          <Button
            kind="ghost"
            label={t('wp25.payUpi', { amount: formatINR(payLink.amount) })}
            onPress={() => void Linking.openURL(payLink.link)}
          />
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.name}>{t('wp25.loyalty')}</Text>
        <Text style={s.sub}>
          {data.loyalty.tier
            ? t('wp25.tier', { tier: data.loyalty.tier.name, points: String(data.loyalty.points) })
            : t('wp25.noTier', { points: String(data.loyalty.points) })}
        </Text>
        {data.loyalty.why ? <Text style={s.sub}>{data.loyalty.why}</Text> : null}
      </View>

      <View style={s.card}>
        <Text style={s.name}>{t('wp25.crops')}</Text>
        {data.crops.length === 0 ? <Text style={s.sub}>{t('wp25.noCrops')}</Text> : null}
        {data.crops.map((c, i) => (
          <Text key={`${c.cropName}-${i}`} style={s.sub}>
            {c.cropName} · {c.stage}
            {c.expectedHarvestDate ? ` · ${t('wp25.harvest', { date: c.expectedHarvestDate })}` : ''}
          </Text>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.name}>{t('wp25.purchases')}</Text>
        {data.purchases.length === 0 ? <Text style={s.sub}>{t('wp25.noPurchases')}</Text> : null}
        {data.purchases.map((p, i) => (
          <Text key={`${p.number}-${i}`} style={s.sub}>
            {p.number} · {p.d} · {p.sku_name} · {formatINR(p.line_total)}
          </Text>
        ))}
      </View>

      <Button kind="ghost" label={t('wp25.signOut')} onPress={() => void signOut()} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  card: { ...surface.card, padding: 14, gap: 8 },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  error: { fontSize: 15, color: colors.danger },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: lineStrong,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.ink,
  },
});
