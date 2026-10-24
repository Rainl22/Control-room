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
