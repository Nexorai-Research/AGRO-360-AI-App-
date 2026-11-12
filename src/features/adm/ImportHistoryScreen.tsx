import { ScrollView, Share, Text } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { fmtWhen } from '../admin/logic';
import { queryState } from '../admin/kit';
import { P, admKey, fetchImportJobs, fetchImportReport, type ImportJob } from './api';
import { Banner, Card, k, useAccess, useRun } from './kit';

function outcome(j: ImportJob, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!j.result) return j.status === 'VALIDATED' ? t('imp.checkedOnly') : '-';
  return t('imp.outcome', {
    created: j.result.created,
    updated: j.result.updated,
    unchanged: j.result.unchanged,
    failed: j.result.failed,
  });
}

export default function ImportHistoryScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const r = useRun(userId);
  const ready = client !== null && userId !== '' && can(P.productImport);

  const jobs = useInfiniteQuery({
    queryKey: admKey(userId, 'imports'),
    queryFn: ({ pageParam, signal }) => fetchImportJobs(client!, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next_cursor ?? undefined,
    enabled: ready,
    retry: false,
  });

  if (!can(P.productImport)) return <StateView state="denied" message={t('imp.denied')} />;
  const early = queryState(jobs, t, t('imp.offline'));
  if (early) return early;
  const rows = jobs.data?.pages.flatMap((p) => p.items) ?? [];

  // The error report is a CSV of the failed rows. It is handed to the phone's share sheet; the app keeps no copy.
  const report = (j: ImportJob) =>
    void r.run(async () => {
      const csv = await fetchImportReport(client!, j.id);
      await Share.share({ title: `import-report-${j.id.slice(0, 8)}.csv`, message: csv });
    }, t('imp.reportReady'));

  return (
    <ScrollView contentContainerStyle={k.page}>
      <Text style={k.title}>{t('imp.title')}</Text>
      <Text style={k.sub}>{t('imp.hint')}</Text>
      <Banner msg={r.msg} failure={r.failure} />
      {rows.length === 0 ? <StateView state="empty" message={t('imp.empty')} /> : null}
      {rows.map((j) => (
        <Card key={j.id}>
          <Text style={k.name}>{t('imp.what', { file: j.filename ?? '-' })}</Text>
          <Text style={k.sub}>
            {fmtWhen(j.createdAt)} · {t(j.status === 'COMMITTED' ? 'imp.applied' : 'imp.checked')}
          </Text>
          <Text style={k.sub}>{t('imp.rows', { total: j.totalRows, errors: j.errorRows })}</Text>
          <Text style={k.sub}>{outcome(j, t as never)}</Text>
          <Button kind="ghost" label={t('imp.report')} disabled={r.busy} onPress={() => report(j)} />
        </Card>
      ))}
      {jobs.hasNextPage ? (
        <Button
          kind="ghost"
          label={t('imp.more')}
          disabled={jobs.isFetchingNextPage}
          onPress={() => void jobs.fetchNextPage()}
        />
      ) : null}
      <Text style={k.sub}>{t('imp.notBuilt')}</Text>
    </ScrollView>
  );
}
