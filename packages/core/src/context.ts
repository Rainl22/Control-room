import { makeEvidence } from './evidence';
import type { Evidence, Invoice, InvoiceContext } from './types';

/**
 * Minimal database shape that context assembly reads from. The app's in-memory
 * store satisfies this; the core never imports the store itself.
 */
export interface ContextSources {
  suppliers: import('./types').Supplier[];
  bankAccounts: import('./types').BankAccount[];
  purchaseOrders: import('./types').PurchaseOrder[];
  invoices: Invoice[];
  payments: import('./types').Payment[];
  rulesetVersion: number;
}

/**
 * Step 2 of the pipeline: gather the supplier record, verified bank details,
 * matching PO, prior invoices and payments. Every fact placed in the context
 * becomes an evidence object with an ID. The AI may cite only what is here.
 */
export function assembleContext(invoice: Invoice, db: ContextSources, now: string): InvoiceContext {
  const supplier = db.suppliers.find((s) => s.id === invoice.supplierId);
  if (!supplier) throw new Error(`invoice ${invoice.id} references unknown supplier ${invoice.supplierId}`);

  const verifiedBankAccounts = db.bankAccounts.filter(
    (a) => a.supplierId === supplier.id && a.status === 'verified',
  );
  const po = invoice.poReference
    ? db.purchaseOrders.find((p) => p.reference === invoice.poReference && p.supplierId === supplier.id)
    : undefined;
  const priorInvoices = db.invoices
    .filter((i) => i.supplierId === supplier.id && i.id !== invoice.id)
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  const priorPayments = db.payments.filter((p) =>
    priorInvoices.some((i) => i.id === p.invoiceId),
  );

  const evidence: Evidence[] = [];
  const inv = (field: string, value: unknown) =>
    evidence.push(makeEvidence('invoice_field', 'invoice', invoice.invoiceNumber, field, value, now));

  inv('supplier_id', invoice.supplierId);
  inv('invoice_number', invoice.invoiceNumber);
  inv('issue_date', invoice.issueDate);
  inv('due_date', invoice.dueDate);
  inv('currency', invoice.currency);
  inv('total', { amountCents: invoice.totalCents, currency: invoice.currency, baseCents: invoice.totalBaseCents });
  inv('po_reference', invoice.poReference ?? null);
  inv('bank_details_on_invoice', invoice.bankDetailsOnInvoice);
  inv('extractor_confidence', invoice.extractorConfidence);
  inv('lines', invoice.lines);

  evidence.push(makeEvidence('supplier_fact', 'supplier', supplier.id, 'status', supplier.status, now));
  evidence.push(makeEvidence('supplier_fact', 'supplier', supplier.id, 'verified_contact', supplier.verifiedContact, now));
  for (const fact of supplier.facts) {
    evidence.push(makeEvidence('supplier_fact', 'supplier_fact', fact.id, 'text', fact.text, now));
  }

  for (const account of verifiedBankAccounts) {
    evidence.push(makeEvidence('bank_record', 'bank', account.id, 'account_number', account.accountNumber, now));
    evidence.push(makeEvidence('bank_record', 'bank', account.id, 'country', account.country, now));
    evidence.push(makeEvidence('bank_record', 'bank', account.id, 'status', account.status, now));
  }

  if (po) {
    evidence.push(makeEvidence('po_record', 'po', po.reference, 'total', { amountCents: po.totalCents, currency: po.currency }, now));
    evidence.push(makeEvidence('po_record', 'po', po.reference, 'status', po.status, now));
    evidence.push(makeEvidence('po_record', 'po', po.reference, 'balance_remaining', { amountCents: po.balanceRemainingCents, currency: po.currency }, now));
    evidence.push(makeEvidence('po_record', 'po', po.reference, 'lines', po.lines, now));
  }

  for (const prior of priorInvoices) {
    evidence.push(makeEvidence('prior_invoice', 'prior_invoice', prior.invoiceNumber, 'invoice_number', prior.invoiceNumber, now));
    evidence.push(makeEvidence('prior_invoice', 'prior_invoice', prior.invoiceNumber, 'total', { amountCents: prior.totalCents, currency: prior.currency }, now));
    evidence.push(makeEvidence('prior_invoice', 'prior_invoice', prior.invoiceNumber, 'issue_date', prior.issueDate, now));
    evidence.push(makeEvidence('prior_invoice', 'prior_invoice', prior.invoiceNumber, 'state', prior.state, now));
  }

  for (const payment of priorPayments) {
    evidence.push(makeEvidence('payment_record', 'payment', payment.id, 'status', payment.status, now));
    evidence.push(makeEvidence('payment_record', 'payment', payment.id, 'amount', { amountCents: payment.amountCents, currency: payment.currency }, now));
  }

  return {
    invoice,
    supplier,
    verifiedBankAccounts,
    po,
    priorInvoices,
    priorPayments,
    rulesetVersion: db.rulesetVersion,
    evidence,
    evidenceIds: new Set(evidence.map((e) => e.id)),
  };
}
