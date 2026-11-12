import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage, type ErrorMessage } from '@/api/errors';
import { currentLanguage, setLanguage, type LangCode } from '@/i18n';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Card, Chips, failText, isNetwork, k, queryState, useAccess, useIdemKey } from '../admin/kit';
import { fmtWhen } from '../admin/logic';
import { PrefsExtras } from './AccountExtras';
import {
  ACCOUNT_PERMISSION,
  acctKey,
  endSession,
  fetchDevices,
  fetchPreferences,
  fetchSessions,
  logoutAll,
  revokeDevice,
  savePreferences,
  validName,
} from './api';

const LANGS: [LangCode, string][] = [
  ['en', 'English'],
  ['hi', 'हिन्दी'],
  ['mr', 'मराठी'],
];
const isLang = (v: string): v is LangCode => LANGS.some(([c]) => c === v);
export const validDeviceReason = (v: string) => v.trim().length >= 5 && v.trim().length <= 500;

export default function AccountScreen() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { client, can, userId } = useAccess();
  const qc = useQueryClient();
  const ready = client !== null && userId !== '' && can(ACCOUNT_PERMISSION);

  const [name, setName] = useState<string | null>(null);
  const [lang, setLang] = useState<LangCode | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<{ id: string; reason: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const idem = useIdemKey();

  const prefs = useQuery({
    queryKey: acctKey(userId, 'prefs'),
    queryFn: ({ signal }) => fetchPreferences(client!, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const sessions = useQuery({
    queryKey: acctKey(userId, 'sessions'),
    queryFn: ({ signal }) => fetchSessions(client!, signal),
    enabled: ready,
    retry: false,
  });
  const devices = useQuery({
    queryKey: acctKey(userId, 'devices'),
    queryFn: ({ signal }) => fetchDevices(client!, signal),
    enabled: ready,
    retry: false,
  });

  async function run(fn: () => Promise<unknown>, done: string, refresh: string[]) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      idem.clear();
      setMsg(done);
      for (const part of refresh) void qc.invalidateQueries({ queryKey: acctKey(userId, part) });
      return true;
    } catch (e) {
      // the key is kept: pressing the same button again is a retry of the same action
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
    return false;
  }

  if (!can(ACCOUNT_PERMISSION)) return <StateView state="denied" message={t('account.denied')} />;
  const early = queryState(prefs, t, t('account.offline'));
  if (early) return early;
  const p = prefs.data!;

  const shownName = name ?? p.displayName;
  const shownLang: LangCode = lang ?? (isLang(p.language) ? p.language : currentLanguage());
  const body: { displayName?: string; language?: string } = {};
  if (shownName.trim() !== p.displayName) body.displayName = shownName.trim();
  if (shownLang !== p.language) body.language = shownLang;
  const changed = Object.keys(body).length > 0;
  const nameBad = !validName(shownName);

  const save = () =>
    void run(
      async () => {
        await savePreferences(client!, body, idem.keyFor(`prefs|${JSON.stringify(body)}`));
        if (body.language) await setLanguage(shownLang);
        setName(null);
        setLang(null);
      },
      t('account.saved'),
      ['prefs'],
    );

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('account.title')}</Text>
      {msg ? (
        <Text style={k.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {failure ? (
        <Text style={k.error} accessibilityRole="alert">
          {failText(t, failure)}
        </Text>
      ) : null}

      <Card>
        <Text style={k.h2}>{t('account.profile')}</Text>
        <TextInput
          value={shownName}
          onChangeText={setName}
          accessibilityLabel={t('account.displayName')}
          placeholder={t('account.displayName')}
          style={k.input}
          maxLength={120}
        />
        {nameBad ? <Text style={k.error}>{t('account.badName')}</Text> : null}
        <Text style={k.sub}>{t('account.language')}</Text>
        <Chips value={shownLang} options={LANGS} onChange={setLang} label={t('account.language')} />
        <Button label={t('account.save')} disabled={busy || !changed || nameBad} onPress={save} />
      </Card>

      <PrefsExtras client={client!} userId={userId} prefs={p} />

      <Text style={k.h2}>{t('account.sessions')}</Text>
      {sessions.isPending ? <Text style={k.sub}>{t('common.loading')}</Text> : null}
      {sessions.error ? (
        <Card>
          <Text style={k.sub}>
            {isNetwork(sessions.error) ? t('account.offline') : t('account.sessionsUnavailable')}
          </Text>
          <Button kind="ghost" label={t('common.retry')} onPress={() => void sessions.refetch()} />
        </Card>
      ) : null}
      {sessions.data && sessions.data.items.length === 0 ? (
        <Text style={k.sub}>{t('account.noSessions')}</Text>
      ) : null}
      {sessions.data?.items.map((s) => (
        <Card key={s.id}>
          <Text style={k.name}>{s.browser ?? t('account.unknownBrowser')}</Text>
          <Text style={k.sub}>
            {t('account.sessionLine', {
              started: fmtWhen(s.startedAt),
              last: fmtWhen(s.lastAccessAt),
              ip: s.ip ?? '-',
            })}
          </Text>
          <Button
            kind="ghost"
            label={t('account.endSession')}
            disabled={busy}
            onPress={() =>
              void run(
                () => endSession(client!, s.id, idem.keyFor(`end|${s.id}`)),
                t('account.sessionEnded'),
                ['sessions'],
              )
            }
          />
        </Card>
      ))}
      {confirmAll ? (
        <Card>
          <Text style={k.sub}>{t('account.logoutAllWarn')}</Text>
          <Button
            label={t('account.logoutAllNow')}
            disabled={busy}
            onPress={() =>
              void run(
                async () => {
                  await logoutAll(client!, idem.keyFor('logout-all'));
                  await signOut();
                },
                t('account.loggedOut'),
                [],
              )
            }
          />
          <Button kind="ghost" label={t('account.cancel')} onPress={() => setConfirmAll(false)} />
        </Card>
      ) : (
        <Button kind="ghost" label={t('account.logoutAll')} onPress={() => setConfirmAll(true)} />
      )}

      <Text style={k.h2}>{t('account.devices')}</Text>
      {devices.isPending ? <Text style={k.sub}>{t('common.loading')}</Text> : null}
      {devices.error ? (
        <Card>
          <Text style={k.sub}>
            {isNetwork(devices.error) ? t('account.offline') : t('account.devicesUnavailable')}
          </Text>
          <Button kind="ghost" label={t('common.retry')} onPress={() => void devices.refetch()} />
        </Card>
      ) : null}
      {devices.data && devices.data.items.length === 0 ? (
        <Text style={k.sub}>{t('account.noDevices')}</Text>
      ) : null}
      {devices.data?.items.map((d) => (
        <Card key={d.id}>
          <Text style={k.name}>
            {d.name} · {d.platform}
          </Text>
          <Text style={k.sub}>
            {t(d.status === 'REGISTERED' ? 'account.deviceActive' : 'account.deviceRevoked')}
            {' · '}
            {t('account.deviceLine', { registered: fmtWhen(d.registeredAt), seen: fmtWhen(d.lastSeenAt) })}
          </Text>
          {d.status === 'REGISTERED' && revoking?.id !== d.id ? (
            <Button
              kind="ghost"
              label={t('account.revoke')}
              onPress={() => setRevoking({ id: d.id, reason: '' })}
            />
          ) : null}
          {revoking?.id === d.id ? (
            <View style={{ gap: 8 }}>
              <Text style={k.sub}>{t('account.revokeWarn')}</Text>
              <TextInput
                value={revoking.reason}
                onChangeText={(reason) => setRevoking({ id: d.id, reason })}
                accessibilityLabel={t('account.reason')}
                placeholder={t('account.reason')}
                style={k.input}
                maxLength={500}
              />
              <Button
                label={t('account.revokeNow')}
                disabled={busy || !validDeviceReason(revoking.reason)}
                onPress={() =>
                  void run(
                    async () => {
                      await revokeDevice(
                        client!,
                        d.id,
                        revoking.reason.trim(),
                        idem.keyFor(`revoke|${d.id}|${revoking.reason.trim()}`),
                      );
                      setRevoking(null);
                    },
                    t('account.revoked'),
                    ['devices'],
                  )
                }
              />
              <Button kind="ghost" label={t('account.cancel')} onPress={() => setRevoking(null)} />
            </View>
          ) : null}
        </Card>
      ))}

      <Card>
        <Text style={k.sub}>{t('account.notBuilt')}</Text>
      </Card>
    </ScrollView>
  );
}
