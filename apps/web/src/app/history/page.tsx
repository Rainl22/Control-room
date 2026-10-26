'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { LoadingState } from '@/components/LoadingState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatBase, formatDate } from '@/lib/format';
import { useCompany } from '@/lib/store';

const STATE_LABELS: Record<string, string> = {
  received: 'Received',
  checking: 'Checking',
  ready: 'Proceeding',
  awaiting_attention: 'Awaiting attention',
  investigating: 'Investigating',
  on_hold: 'On hold',
  blocked: 'Blocked',
  approved: 'Approved',
  payment_scheduled: 'Payment scheduled',
  paid: 'Paid',
  rejected: 'Rejected',
  recovery: 'In recovery',
};

/**
 * Recent activity: every invoice, Routine included. Routine work never enters
 * the queue, but it is never invisible — this is where scenario 6a's duplicate
 * can be found by a person browsing.
 */
export default function HistoryPage() {
  const { company, processed, displayCurrency, init } = useCompany();
  const router = useRouter();

  useEffect(() => {
    void init();
  }, [init]);

  if (!company) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Header />
        <LoadingState />
      </main>
    );
  }

  const rows = [...company.invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header />
      <div className="mb-4">
        <h1 className="font-display text-lg font-semibold">History</h1>
        <p className="text-xs text-ink-muted">
          Every invoice, routine ones included. “Why did this happen?” is answerable for any of them.
        </p>
      </div>
      <section className="rounded-card bg-surface shadow-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="px-5 py-2.5 font-medium">Invoice</th>
              <th className="px-2 py-2.5 font-medium">Supplier</th>
              <th className="px-2 py-2.5 font-medium">Class</th>
              <th className="px-2 py-2.5 font-medium">State</th>
              <th className="px-2 py-2.5 font-medium">Issued</th>
              <th className="px-5 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => {
              const supplier = company.suppliers.find((s) => s.id === invoice.supplierId);
              const finalClass = processed[invoice.id]?.result.merge.finalClass;
              return (
                <tr
                  key={invoice.id}
                  onClick={() => router.push(`/invoice/${invoice.id}`)}
                  className="cursor-pointer border-t border-canvas hover:bg-canvas/60"
                >
                  <td className="px-5 py-2 font-mono text-xs">{invoice.invoiceNumber}</td>
                  <td className="px-2 py-2">{supplier?.name}</td>
                  <td className="px-2 py-2">{finalClass ? <StatusBadge outcomeClass={finalClass} /> : <span className="text-xs text-ink-muted">—</span>}</td>
                  <td className="px-2 py-2 text-ink-muted">{STATE_LABELS[invoice.state]}</td>
                  <td className="px-2 py-2 text-ink-muted">{formatDate(invoice.issueDate)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">
                    {formatBase(invoice.totalBaseCents, displayCurrency, company.settings)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
