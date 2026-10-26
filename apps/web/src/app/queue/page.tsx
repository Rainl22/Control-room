'use client';

import { primaryReason, type OutcomeClass } from '@control-room/core';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { LoadingState } from '@/components/LoadingState';
import { StatusBadge } from '@/components/StatusBadge';
import { daysUntil, formatBase } from '@/lib/format';
import { attentionRows, sortedRows, type QueueRow, type SortKey } from '@/lib/queue';
import { useCompany } from '@/lib/store';

type GroupBy = 'none' | 'class' | 'supplier';
const CLASS_FILTERS: Array<{ value: OutcomeClass | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'hard_stop', label: 'Hard stops' },
  { value: 'uncertainty', label: 'Uncertainty' },
  { value: 'authority', label: 'Authority' },
];

/** Shared by the header row and every body table so columns line up. */
function Cols() {
  return (
    <colgroup>
      <col className="w-44" />
      <col className="w-28" />
      <col className="w-52" />
      <col />
      <col className="w-28" />
      <col className="w-32" />
    </colgroup>
  );
}

const CLASS_GROUP_LABEL: Record<string, string> = {
  hard_stop: 'Hard stops',
  uncertainty: 'Uncertainty',
  authority: 'Authority',
  routine: 'Routine',
};

function QueueTable({ rows, today }: { rows: QueueRow[]; today: string }) {
  const { company, displayCurrency } = useCompany();
  const router = useRouter();
  if (!company) return null;
  return (
    <table className="w-full table-fixed text-[13px]">
      <Cols />
      <tbody>
        {rows.map(({ invoice, finalClass, record }) => {
          const reasons = record.result.merge.reasons;
          const primary = primaryReason(reasons);
          const more = reasons.length - 1;
          const supplier = company.suppliers.find((s) => s.id === invoice.supplierId);
          const due = daysUntil(invoice.dueDate, today);
          return (
            <tr
              key={invoice.id}
              onClick={() => router.push(`/invoice/${invoice.id}`)}
              className="cursor-pointer border-t border-canvas hover:bg-canvas/60"
            >
              <td className="px-5 py-3">
                <StatusBadge outcomeClass={finalClass} kind={primary?.kind} compact />
              </td>
              <td className="whitespace-nowrap px-2 py-3 font-mono text-xs">{invoice.invoiceNumber}</td>
              <td className="px-2 py-3">{supplier?.name}</td>
              <td className="px-2 py-3 text-ink-muted">
                {primary?.description}
                {more > 0 ? <span className="ml-1 text-xs">+{more} more</span> : null}
              </td>
              <td className={`px-2 py-3 ${due < 0 ? 'font-medium text-hardstop' : ''}`}>
                {due < 0 ? `${-due}d overdue` : `in ${due}d`}
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs">
                {formatBase(invoice.totalBaseCents, displayCurrency, company.settings)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QueuePageInner() {
  const { company, processed, status, init } = useCompany();
  const searchParams = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [classFilter, setClassFilter] = useState<OutcomeClass | 'all'>(
    (searchParams.get('class') as OutcomeClass) ?? 'all',
  );
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void init();
  }, [init]);

  const supplierName = useMemo(() => {
    const map = new Map(company?.suppliers.map((s) => [s.id, s.name]) ?? []);
    return (id: string) => map.get(id) ?? id;
  }, [company]);

  if (!company) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Header />
        <LoadingState />
      </main>
    );
  }

  const today = company.settings.demoToday;
  let rows = attentionRows(company.invoices, processed);
  if (classFilter !== 'all') rows = rows.filter((r) => r.finalClass === classFilter || r.finalClass === 'hard_stop');
  const needle = search.trim().toLowerCase();
  if (needle) {
    rows = rows.filter(({ invoice, record }) => {
      const reasons = record.result.merge.reasons;
      const haystack = [
        invoice.invoiceNumber,
        supplierName(invoice.supplierId),
        ...reasons.map((r) => r.description),
        ...reasons.map((r) => r.sourceId),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }
  if (sortKey) rows = sortedRows(rows, sortKey, direction, supplierName);

  const groups: Array<{ label: string | null; rows: QueueRow[] }> = [];
  if (groupBy === 'none') {
    groups.push({ label: null, rows });
  } else {
    const byKey = new Map<string, QueueRow[]>();
    for (const row of rows) {
      const key = groupBy === 'class' ? (CLASS_GROUP_LABEL[row.finalClass] ?? row.finalClass) : supplierName(row.invoice.supplierId);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }
    for (const [label, groupRows] of byKey) groups.push({ label, rows: groupRows });
  }

  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      className={`font-medium ${sortKey === key ? 'text-ink' : ''}`}
      onClick={() => {
        if (sortKey === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        else {
          setSortKey(key);
          setDirection('asc');
        }
      }}
    >
      {label}
      {sortKey === key ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-lg font-semibold">Attention queue</h1>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <select
            aria-label="Filter by class"
            className="rounded-md border border-routine-tint bg-surface px-2 py-1"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as OutcomeClass | 'all')}
          >
            {CLASS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Group by"
            className="rounded-md border border-routine-tint bg-surface px-2 py-1"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          >
            <option value="none">No grouping</option>
            <option value="class">Group by class</option>
            <option value="supplier">Group by supplier</option>
          </select>
          {(sortKey || groupBy !== 'none' || classFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSortKey(null);
                setGroupBy('none');
                setClassFilter('all');
              }}
              className="rounded-md border border-ink/20 px-2 py-1 hover:border-ink/50"
            >
              Reset to smart order
            </button>
          )}
        </div>
      </div>
      <input
        type="search"
        aria-label="Search the queue"
        placeholder="Search by invoice, supplier or reason"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-routine-tint bg-surface px-3 py-2 text-[13px] placeholder:text-ink-muted/70"
      />
      <p className="mb-3 text-xs text-ink-muted">
        Smart order: hard stops pinned, then due date, then amount. Hard stops stay pinned above any sort or
        grouping you apply.
      </p>

      <section className="rounded-card bg-surface shadow-card">
        <table className="w-full table-fixed text-xs text-ink-muted">
          <Cols />
          <thead>
            <tr className="text-left">
              <th className="px-5 py-2.5 text-left font-normal">{header('class', 'Class')}</th>
              <th className="px-2 py-2.5 text-left font-normal">Invoice</th>
              <th className="px-2 py-2.5 text-left font-normal">{header('supplier', 'Supplier')}</th>
              <th className="px-2 py-2.5 text-left font-normal">Why</th>
              <th className="px-2 py-2.5 text-left font-normal">{header('due', 'Due')}</th>
              <th className="px-5 py-2.5 text-right font-normal">{header('amount', 'Amount')}</th>
            </tr>
          </thead>
        </table>
        {groups.map((group) => (
          <div key={group.label ?? 'all'}>
            {group.label ? (
              <div className="bg-canvas/60 px-5 py-1.5 text-xs font-medium text-ink-muted">{group.label}</div>
            ) : null}
            <QueueTable rows={group.rows} today={today} />
          </div>
        ))}
        {rows.length === 0 && status === 'ready' ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-muted">{needle ? `No invoices match “${search.trim()}”.` : 'Nothing needs attention.'}</p>
        ) : null}
      </section>
    </main>
  );
}

export default function QueuePage() {
  return (
    <Suspense>
      <QueuePageInner />
    </Suspense>
  );
}
