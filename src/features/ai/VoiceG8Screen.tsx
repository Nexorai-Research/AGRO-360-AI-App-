import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { G8, parseVoice, type VoiceCart, type VoiceLang, type VoiceSearch } from './api-g8';

export default function VoiceG8Screen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [text, setText] = useState('');
  const [lang, setLang] = useState<VoiceLang>('en');
  const [intent, setIntent] = useState<'cart' | 'search'>('cart');
  const [out, setOut] = useState<VoiceCart | VoiceSearch | null>(null);
  const [tried, setTried] = useState(false);
  if (!s.can(G8.assistant)) return <StateView state="denied" message={t('ai.denied')} />;
  const bad = text.trim().length < 1 || text.length > 600;
  function run() {
    setTried(true);
    if (bad) return;
    const body = { transcript: text.trim(), lang, intent };
    void s.act(
      t('ai.vo.done'),
      async () => setOut(await parseVoice(s.client!, body, key.keyFor(JSON.stringify(body)))),
      () => key.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiVoice') }} />
      <Text style={k.title}>{t('ai.vo.title')}</Text>
      <Text style={k.sub}>{t('ai.vo.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Chips
        options={(['cart', 'search'] as const).map((x) => ({ value: x, label: t(`ai.vo.intent.${x}`) }))}
        value={intent}
        onChange={(v) => (setIntent(v as 'cart' | 'search'), setOut(null))}
      />
      <Chips
        options={(['en', 'hi', 'mr'] as const).map((x) => ({ value: x, label: t(`ai.vo.lang.${x}`) }))}
        value={lang}
        onChange={(v) => setLang(v as VoiceLang)}
      />
      <Field
        label={t('ai.vo.words')}
        value={text}
        onChange={(v) => (setText(v), setOut(null))}
        multiline
        error={tried && bad ? t('ai.vo.bad') : null}
      />
      <Button label={t('ai.vo.run')} disabled={s.busy} onPress={run} />
      {out?.intent === 'cart' ? (
        <>
          {out.customer ? (
            <View style={k.card}>
              <Text style={k.name}>{t('ai.vo.customer', { name: out.customer.query })}</Text>
            </View>
          ) : null}
          {out.lines.length === 0 ? <Text style={k.warn}>{t('ai.vo.noLines')}</Text> : null}
          {out.lines.map((l, i) => (
            <View key={`${l.productQuery}-${i}`} style={k.card}>
              <Text style={k.name}>{l.productQuery}</Text>
              <Text style={l.qtyAssumed ? k.warn : k.sub}>
                {t('ai.vo.qty', { qty: l.qty, unit: l.unit ?? '' })}
                {l.qtyAssumed ? ` · ${t('ai.vo.assumed')}` : ''}
              </Text>
            </View>
          ))}
          {out.warnings.map((w) => (
            <Text key={w} style={k.warn}>
              {w}
            </Text>
          ))}
          <Text style={k.sub}>{out.note}</Text>
        </>
      ) : null}
      {out?.intent === 'search' ? (
        <View style={k.card}>
          <Text style={k.name}>{out.query}</Text>
          <Text style={k.sub}>{out.note}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
