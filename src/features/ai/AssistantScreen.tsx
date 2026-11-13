import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { currentLanguage, setLanguage } from '@/i18n';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { ApiError } from '@/api/errors';
import { newId } from '@/device';
import { Notice, k, useErrorText } from '../purchase/ui';
import { sendChat, type Block, type ChatMessage } from './api';
import { makeTools, runToolUses } from './tools';

/** At most this many model calls for one question: a model that keeps asking for tools is stopped. */
export const MAX_STEPS = 8;

interface Line {
  id: number;
  who: 'me' | 'bot';
  text: string;
}
interface Ask {
  title: string;
  rows: [string, string][];
  answer: (yes: boolean) => void;
}

const textOf = (content: Block[]) =>
  content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => String(b.text).trim())
    .filter(Boolean)
    .join('\n');

/** India date today, YYYY-MM-DD (the server's day is India time). */
const indiaToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default function AssistantScreen() {
  const { t } = useTranslation();
  const { me, client, signOut } = useAuth();
  const router = useRouter();
  const errText = useErrorText();
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const history = useRef<ChatMessage[]>([]);
  const lock = useRef(false);
  const seq = useRef(0);
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);

  const tools = useMemo(
    () =>
      client
        ? makeTools({
            client,
            can,
            confirm: (title, rows) =>
              new Promise<boolean>((resolve) =>
                setAsk({ title, rows, answer: (y) => (setAsk(null), resolve(y)) }),
              ),
            go: (r) => router.push(r as never),
            openCustomer: (id) => router.push(`/customers/${id}` as never),
            setLang: (c) => void setLanguage(c),
            signOut: () => void signOut(),
            today: indiaToday,
          })
        : null,
    // can() reads the current user; the tools are rebuilt only when the session changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, me],
  );

  const push = (who: Line['who'], text: string) => setLines((l) => [...l, { id: ++seq.current, who, text }]);

  async function submit() {
    const q = draft.trim();
    if (!q || lock.current || !client || !tools) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    setDraft('');
    push('me', q);
    const base = history.current.length;
    history.current.push({ role: 'user', content: q });
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        // One key per model call: a retry after a lost answer is a new tap, so a new call and a new key.
        const r = await sendChat(
          client,
          { messages: [...history.current], today: indiaToday(), lang: currentLanguage() },
          newId(),
        );
        history.current.push({ role: 'assistant', content: r.content });
        const said = textOf(r.content);
        if (said) push('bot', said);
        if (!r.content.some((b) => b.type === 'tool_use')) return;
        const results = await runToolUses(tools, r.content);
        history.current.push({ role: 'user', content: results });
      }
      push('bot', t('ai.tooLong'));
    } catch (e) {
      // A conversation that stops halfway would be refused when sent again (a tool call without its result): drop this question.
      history.current.length = base;
      setFailure(e instanceof ApiError && e.code === 'NETWORK' ? t('ai.offline') : errText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function clear() {
    history.current = [];
    setLines([]);
    setFailure(null);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.assistant') }} />
      <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
        <Text style={k.sub}>{t('ai.intro')}</Text>
        {lines.length === 0 ? (
          <View style={k.card}>
            <Text style={k.name}>{t('ai.tryTitle')}</Text>
            {(['try1', 'try2', 'try3'] as const).map((x) => (
              <Text key={x} style={k.sub}>
                {t(`ai.${x}`)}
              </Text>
            ))}
          </View>
        ) : null}
        {lines.map((l) => (
          <View
            key={l.id}
            accessibilityLabel={`${l.who === 'me' ? t('ai.you') : t('ai.bot')}: ${l.text}`}
            style={[
              k.card,
              l.who === 'me'
                ? { alignSelf: 'flex-end', backgroundColor: colors.brandSoft }
                : { alignSelf: 'flex-start' },
              { maxWidth: '90%' },
            ]}
          >
            <Text style={k.sub}>{l.who === 'me' ? t('ai.you') : t('ai.bot')}</Text>
            <Text style={k.name}>{l.text}</Text>
          </View>
        ))}
        {busy && !ask ? <Text style={k.sub}>{t('ai.thinking')}</Text> : null}
        {ask ? (
          <View style={[k.card, { borderColor: colors.warn }]}>
            <Text style={k.name}>{ask.title}</Text>
            {ask.rows.map(([a, b]) => (
              <Text key={a} style={k.sub}>
                {a}: {b}
              </Text>
            ))}
            <View style={k.row}>
              <Button label={t('ai.yes')} onPress={() => ask.answer(true)} />
              <Button kind="ghost" label={t('ai.no')} onPress={() => ask.answer(false)} />
            </View>
          </View>
        ) : null}
        {failure ? <Notice tone="error" text={failure} /> : null}
        <Text style={k.sub}>{t('ai.note')}</Text>
      </ScrollView>
      <View
        style={{
          padding: 12,
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: colors.card,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          accessibilityLabel={t('ai.input')}
          placeholder={t('ai.input')}
          editable={!busy}
          multiline
          style={[k.input, { maxHeight: 120, borderRadius: radius }]}
        />
        <View style={k.row}>
          <Button label={t('ai.send')} disabled={busy || draft.trim() === ''} onPress={() => void submit()} />
          {lines.length > 0 ? (
            <Button kind="ghost" label={t('ai.clear')} disabled={busy} onPress={clear} />
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
