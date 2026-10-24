'use client';

import { primaryReason, type OutcomeClass } from '@control-room/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { daysUntil, formatBase } from '@/lib/format';
import { attentionRows, bandFor, BAND_LABELS, type Band, type QueueRow } from '@/lib/queue';
import { useCompany } from '@/lib/store';

const CLASS_CARDS: Array<{ cls: OutcomeClass; title: string }> = [
  { cls: 'hard_stop', title: 'Hard stops' },
  { cls: 'uncertainty', title: 'Uncertainty' },
  { cls: 'authority', title: 'Authority' },
];

const BAND_ORDER: Band[] = ['hard_stops', 'overdue', 'due_this_week', 'later'];

/**
 * Home: the top five in the default order, grouped in bands so the order
 * explains itself. Not a sortable surface — the full queue is.
 */
export default function Home() {
  const { company, processed, status, displayCurrency, init } = useCompany();
  const router = useRouter();

  useEffect(() => {
    void init();
  }, [init]);

  if (!company) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-ink-muted">Loading the company…</main>;
  }

  const today = company.settings.demoToday;
  const rows = attentionRows(company.invoices, processed);
  const counts: Partial<Record<OutcomeClass, number>> = {};
  for (const row of rows) counts[row.finalClass] = (counts[row.finalClass] ?? 0) + 1;
  const routineInFlight = company.invoices.filter(
    (i) => i.state === 'ready' || i.state === 'payment_scheduled',
  ).length;

  const topFive = rows.slice(0, 5);
  const bands: Array<{ band: Band; rows: QueueRow[] }> = BAND_ORDER.map((band) => ({
    band,
    rows: topFive.filter((row) => bandFor(row, today) === band),
  })).filter((entry) => entry.rows.length > 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header />

      <section className="mb-8 grid grid-cols-3 gap-4">
        {CLASS_CARDS.map(({ cls, title }) => (
          <Link
            key={cls}
            href={`/queue?class=${cls}`}
            className="rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-md"
          >
            <div className="font-display text-2xl font-semibold">{counts[cls] ?? 0}</div>
            <div className="mt-1">
              <StatusBadge outcomeClass={cls} />
            </div>
            <div className="mt-1 text-xs text-ink-muted">{title}</div>
          </Link>
        ))}
      </section>

      <section className="rounded-card bg-surface shadow-card">
        <div className="flex items-baseline justify-between border-b border-canvas px-5 py-3">
          <span className="text-sm font-medium">
            Needs attention {status === 'processing' ? '· processing intake…' : ''}
          </span>
          <Link href="/queue" className="text-xs text-ink-muted hover:text-ink">
            Full queue ({rows.length}) →
          </Link>
        </div>
        {bands.map(({ band, rows: bandRows }) => (
          <div key={band}>
            <div className="bg-canvas/60 px-5 py-1.5 text-xs font-medium text-ink-muted">{BAND_LABELS[band]}</div>
            <ul>
              {bandRows.map(({ invoice, finalClass, record }) => {
                const reasons = record.result.merge.reasons;
                const primary = primaryReason(reasons);
                const supplier = company.suppliers.find((s) => s.id === invoice.supplierId);
                const due = daysUntil(invoice.dueDate, today);
                return (
                  <li key={invoice.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/invoice/${invoice.id}`)}
                      className="flex w-full items-center gap-3 border-t border-canvas px-5 py-3 text-left text-[13px] hover:bg-canvas/60"
                    >
                      <span className="w-44 flex-none">
                        <StatusBadge outcomeClass={finalClass} kind={primary?.kind} />
                      </span>
                      <span className="w-24 flex-none font-mono text-xs">{invoice.invoiceNumber}</span>
                      <span className="w-48 flex-none truncate">{supplier?.name}</span>
                      <span className="flex-1 truncate text-ink-muted">{primary?.description}</span>
                      <span className={`w-24 flex-none ${due < 0 ? 'font-medium text-hardstop' : ''}`}>
                        {due < 0 ? `${-due}d overdue` : `in ${due}d`}
                      </span>
                      <span className="w-28 flex-none text-right font-mono text-xs">
                        {formatBase(invoice.totalBaseCents, displayCurrency, company.settings)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {rows.length === 0 && status === 'ready' ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-muted">Nothing needs attention.</p>
        ) : null}
      </section>

      <p className="mt-4 text-xs text-ink-muted">
        {routineInFlight} routine invoices are proceeding on their own. Routine work never enters the queue; it
        stays visible in <Link href="/history" className="underline hover:text-ink">history</Link>.
      </p>
    </main>
  );
}
