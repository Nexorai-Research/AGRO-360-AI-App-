import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chips, Field, kit } from '@/ui/kit';
import { rangeProblem, type ListFilter } from './list-filter';

/**
 * The search and filters of the web's lists, in one block: a search box, an optional status filter (only the statuses the list has), an optional
 * date range (YYYY-MM-DD, From not after To) and an optional "Paid by" filter. The parent keeps the filter and applies it with filterRows.
 */
export function ListFilters({
  value,
  onChange,
  searchLabel,
  statuses,
  statusLabel,
  dates = false,
  paidBy = false,
}: {
  value: ListFilter;
  onChange: (f: ListFilter) => void;
  searchLabel: string;
  /** The statuses offered; none (or an empty list) hides the filter. */
  statuses?: string[];
  statusLabel?: (s: string) => string;
  dates?: boolean;
  paidBy?: boolean;
}) {
  const { t } = useTranslation();
  const problem = dates ? rangeProblem(value.from, value.to) : null;
  const set = (patch: Partial<ListFilter>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field label={searchLabel} value={value.q} onChange={(q) => set({ q })} />
      {statuses && statuses.length > 0 ? (
        <Chips
          label={t('wp31.status')}
          options={[
            { id: '', label: t('wp31.all') },
            ...statuses.map((s) => ({ id: s, label: statusLabel ? statusLabel(s) : s })),
          ]}
          value={value.status}
          onChange={(status) => set({ status })}
        />
      ) : null}
      {paidBy ? (
        <Chips
          label={t('wp31.paidBy')}
          options={[
            { id: '', label: t('wp31.all') },
            { id: 'CASH', label: t('wp31.paid.CASH') },
            { id: 'DIGITAL', label: t('wp31.paid.DIGITAL') },
            { id: 'CREDIT', label: t('wp31.paid.CREDIT') },
          ]}
          value={value.paidBy}
          onChange={(p) => set({ paidBy: p })}
        />
      ) : null}
      {dates ? (
        <>
          <Field
            label={t('wp31.from')}
            value={value.from}
            onChange={(from) => set({ from })}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label={t('wp31.to')}
            value={value.to}
            onChange={(to) => set({ to })}
            placeholder="YYYY-MM-DD"
          />
          {problem ? <Text style={kit.sub}>{t(`wp31.range.${problem}`)}</Text> : null}
        </>
      ) : null}
    </>
  );
}
