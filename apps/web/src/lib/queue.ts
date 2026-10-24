import type { Invoice, OutcomeClass } from '@control-room/core';
import type { ProcessedRecord } from './store';

export interface QueueRow {
  invoice: Invoice;
  finalClass: OutcomeClass;
  record: ProcessedRecord;
}

/**
 * The default "smart" order (brief section 3): hard stops pinned to the top,
 * then payment due date, soonest first (overdue at the very top), then amount,
 * largest first.
 */
export function smartOrder(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    const aHard = a.finalClass === 'hard_stop' ? 0 : 1;
    const bHard = b.finalClass === 'hard_stop' ? 0 : 1;
    if (aHard !== bHard) return aHard - bHard;
    if (a.invoice.dueDate !== b.invoice.dueDate) return a.invoice.dueDate < b.invoice.dueDate ? -1 : 1;
    return b.invoice.totalBaseCents - a.invoice.totalBaseCents;
  });
}

/** Invoices that need a person: in the attention queue or blocked. */
export function attentionRows(
  invoices: Invoice[],
  processed: Record<string, ProcessedRecord>,
): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const invoice of invoices) {
    if (invoice.state !== 'awaiting_attention' && invoice.state !== 'blocked') continue;
    const record = processed[invoice.id];
    if (!record) continue;
    rows.push({ invoice, finalClass: record.result.merge.finalClass, record });
  }
  return smartOrder(rows);
}

export type Band = 'hard_stops' | 'overdue' | 'due_this_week' | 'later';

export const BAND_LABELS: Record<Band, string> = {
  hard_stops: 'Hard stops',
  overdue: 'Overdue',
  due_this_week: 'Due this week',
  later: 'Later',
};

/** Home bands (brief section 3): the order explains itself. */
export function bandFor(row: QueueRow, today: string): Band {
  if (row.finalClass === 'hard_stop') return 'hard_stops';
  if (row.invoice.dueDate < today) return 'overdue';
  const weekOut = new Date(`${today}T00:00:00Z`);
  weekOut.setUTCDate(weekOut.getUTCDate() + 7);
  if (row.invoice.dueDate <= weekOut.toISOString().slice(0, 10)) return 'due_this_week';
  return 'later';
}

export type SortKey = 'due' | 'amount' | 'supplier' | 'class';

/**
 * Full-queue sorting: every column sortable, but hard stops stay pinned above
 * any sort the person applies, so nobody can sort a fraud risk out of sight.
 */
export function sortedRows(
  rows: QueueRow[],
  sortKey: SortKey,
  direction: 'asc' | 'desc',
  supplierName: (id: string) => string,
): QueueRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: QueueRow, b: QueueRow): number => {
    switch (sortKey) {
      case 'due':
        return a.invoice.dueDate < b.invoice.dueDate ? -sign : a.invoice.dueDate > b.invoice.dueDate ? sign : 0;
      case 'amount':
        return sign * (a.invoice.totalBaseCents - b.invoice.totalBaseCents);
      case 'supplier':
        return sign * supplierName(a.invoice.supplierId).localeCompare(supplierName(b.invoice.supplierId));
      case 'class':
        return sign * a.finalClass.localeCompare(b.finalClass);
    }
  };
  return [...rows].sort((a, b) => {
    const aHard = a.finalClass === 'hard_stop' ? 0 : 1;
    const bHard = b.finalClass === 'hard_stop' ? 0 : 1;
    if (aHard !== bHard) return aHard - bHard;
    return compare(a, b);
  });
}
