import { useState } from 'react';
import { Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Field } from '@/ui/kit';
import { Button } from '@/ui/Button';
import { Card, Chips, k } from '../admin/kit';
import { Result, useRunner } from '../admin/usr-run';
import { savePrefsExtra } from '../admin/usr-api';
import { DATE_FORMATS, THEMES, validPrinter } from '../admin/usr-logic';
import { acctKey, type Preferences } from './api';

/**
 * Date format, theme and default printer (PUT /me/preferences, same endpoint as name and language). They are saved on the server for
 * this person. This app does not change its own look or date style from them yet: the web app does.
 */
export function PrefsExtras({ client, userId, prefs }: { client: ApiClient; userId: string; prefs: Preferences }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const r = useRunner();
  const [dateFormat, setDateFormat] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [printer, setPrinter] = useState<string | null>(null);

  const body: { dateFormat?: string; theme?: string; printer?: string | null } = {};
  if (dateFormat !== null && dateFormat !== prefs.dateFormat) body.dateFormat = dateFormat;
  if (theme !== null && theme !== prefs.theme) body.theme = theme;
  if (printer !== null && printer.trim() !== (prefs.printer ?? '')) body.printer = printer.trim() === '' ? null : printer.trim();
  const changed = Object.keys(body).length > 0;
  const printerBad = printer !== null && !validPrinter(printer);

  return (
    <Card>
      <Text style={k.h2}>{t('acx.title')}</Text>
      <Result msg={r.msg} failure={r.failure} />
      <Chips
        value={dateFormat ?? prefs.dateFormat}
        label={t('acx.dateFormat')}
        onChange={setDateFormat}
        options={DATE_FORMATS.map((f): [string, string] => [f, f])}
      />
      <Chips
        value={theme ?? prefs.theme}
        label={t('acx.theme')}
        onChange={setTheme}
        options={THEMES.map((x): [string, string] => [x, t(`acx.theme_${x}`)])}
      />
      <Field
        label={t('acx.printer')}
        value={printer ?? prefs.printer ?? ''}
        onChange={setPrinter}
        error={printerBad ? t('acx.badPrinter') : null}
      />
      <Text style={k.sub}>{t('acx.note')}</Text>
      <Button
        label={t('acx.save')}
        disabled={r.busy || !changed || printerBad}
        onPress={() =>
          void r
            .run(() => savePrefsExtra(client, body, r.idem.keyFor(`prefs-x|${JSON.stringify(body)}`)), t('account.saved'))
            .then((ok) => {
              if (ok) {
                setDateFormat(null);
                setTheme(null);
                setPrinter(null);
                void qc.invalidateQueries({ queryKey: acctKey(userId, 'prefs') });
              }
            })
        }
      />
    </Card>
  );
}
