'use client';

import { primaryReason, type OutcomeClass } from '@control-room/core';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { daysUntil, formatBase, formatDate } from '@/lib/format';
import { attentionRows } from '@/lib/queue';
import { useCompany } from '@/lib/store';

const CLASS_ORDER: OutcomeClass[] = ['hard_stop', 'uncertainty', 'authority'];
const CLASS_TITLES: Record<OutcomeClass, string> = {
  hard_stop: 'Hard stops',
  uncertainty: 'Uncertainty',
  authority: 'Authority',
  routine: 'Routine',
};

export default function Home() {
  const { company, processed, status, displayCurrency, init } = useCompany();
  const router = useRouter();

  useEffect(() => {
    void init();
  }, [init]);

  if (!company) {
    return <main className="p-10 text-ink-muted">Loading the company…</main>;
  }

  const rows = attentionRows(company.invoices, processed);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.finalClass] = (counts[row.finalClass] ?? 0) + 1;
  const routineInFlight = company.invoices.filter((i) => i.state === 'ready').length;
  const today = company.settings.demoToday;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header />

      <section className="mb-8 grid grid-cols-3 gap-4">
        {CLASS_ORDER.map((cls) => (
          <div key={cls} className="rounded-card bg-surface p-4 shadow-card">
            <div className="text-2xl font-semibold font-display">{counts[cls] ?? 0}</div>
            <div className="mt-1">
              <StatusBadge outcomeClass={cls} />
            </div>
            <div className="mt-1 text-xs text-ink-muted">{CLASS_TITLES[cls]}</div>
          </div>
        ))}
      </section>

      <section className="rounded-card bg-surface shadow-card">
        <div className="border-b border-canvas px-5 py-3 text-sm font-medium">
          Needs attention {status === 'processing' ? '· processing intake…' : ''}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="px-5 py-2 font-medium">Class</th>
              <th className="px-2 py-2 font-medium">Invoice</th>
              <th className="px-2 py-2 font-medium">Supplier</th>
              <th className="px-2 py-2 font-medium">Why</th>
              <th className="px-2 py-2 font-medium">Due</th>
              <th className="px-5 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
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
                    <StatusBadge outcomeClass={finalClass} kind={primary?.kind} />
                  </td>
                  <td className="px-2 py-3 font-mono text-xs">{invoice.invoiceNumber}</td>
                  <td className="px-2 py-3">{supplier?.name}</td>
                  <td className="max-w-72 px-2 py-3 text-ink-muted">
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
            {rows.length === 0 && status === 'ready' ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-ink-muted">
                  Nothing needs attention.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <p className="mt-4 text-xs text-ink-muted">
        {routineInFlight} routine invoices are proceeding on their own. Routine work never enters the queue; it
        stays visible in history.
      </p>
    </main>
  );
}
