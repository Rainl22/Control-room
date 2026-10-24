import { usd } from '../money.js';
import type { Invoice, Payment, PurchaseOrder } from '../types.js';
import { verifiedAccountFor } from './company.js';

/**
 * Deterministic filler: ~49 Routine invoices so the eight fixtures stand out
 * in a company that pays about 300 invoices a month. Same fixed seed, same data.
 */

/** mulberry32 PRNG: tiny, deterministic, good enough for synthetic data. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Payment runs happen on Thursdays. */
export function thursdayOnOrBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const shift = (d.getUTCDay() - 4 + 7) % 7; // 4 = Thursday
  return addDays(isoDate, -shift);
}

const FILLER_SUPPLIERS: Array<{ id: string; terms: number; funding: string; description: string }> = [
  { id: 'sup_001', terms: 30, funding: 'acct_ops', description: 'Cartons and void fill' },
  { id: 'sup_003', terms: 30, funding: 'acct_ops', description: 'Pallet freight' },
  { id: 'sup_006', terms: 30, funding: 'acct_ops', description: 'Office supplies' },
  { id: 'sup_007', terms: 20, funding: 'acct_pay', description: 'Utilities' },
  { id: 'sup_008', terms: 30, funding: 'acct_ops', description: 'Managed IT services' },
  { id: 'sup_009', terms: 30, funding: 'acct_ops', description: 'Safety gloves and eyewear' },
  { id: 'sup_012', terms: 30, funding: 'acct_pay', description: 'Facility lighting maintenance' },
  { id: 'sup_002', terms: 15, funding: 'acct_pay', description: 'Deep-clean service call' },
];

export interface FillerData {
  invoices: Invoice[];
  purchaseOrders: PurchaseOrder[];
  payments: Payment[];
}

const DEMO_TODAY = '2025-10-14';
const FILLER_COUNT = 49;
const HISTORICAL_COUNT = 38; // the rest are current and still Routine-in-flight

export function buildFiller(seed = 20251014): FillerData {
  const rand = mulberry32(seed);
  const invoices: Invoice[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const payments: Payment[] = [];

  for (let i = 0; i < FILLER_COUNT; i++) {
    const supplier = FILLER_SUPPLIERS[i % FILLER_SUPPLIERS.length]!;
    const historical = i < HISTORICAL_COUNT;
    // Whole-dollar amounts between $140 and ~$8,600, unique-ish per invoice.
    const amountCents = usd(140 + Math.floor(rand() * 8000) + i * 9);
    const issueOffset = historical
      ? -(14 + Math.floor(rand() * 110)) // June–September
      : -Math.floor(rand() * 12); // the last two weeks
    const issueDate = addDays(DEMO_TODAY, issueOffset);
    const dueDate = addDays(issueDate, supplier.terms);
    const invoiceNumber = `INV-9${String(100 + i)}`;
    const account = verifiedAccountFor(supplier.id);
    const needsPo = amountCents > usd(500);
    const poReference = needsPo ? `PO-7${String(100 + i)}` : undefined;

    if (needsPo && poReference) {
      purchaseOrders.push({
        id: `po_7${String(100 + i)}`,
        supplierId: supplier.id,
        reference: poReference,
        kind: 'standard',
        lines: [
          {
            id: `${poReference}-l1`,
            description: supplier.description,
            quantity: 1,
            unitPriceCents: amountCents,
            amountCents,
          },
        ],
        totalCents: amountCents,
        currency: 'USD',
        balanceRemainingCents: historical ? 0 : amountCents,
        status: historical ? 'closed' : 'open',
        requester: 'usr_dana',
      });
    }

    invoices.push({
      id: `inv_9${String(100 + i)}`,
      supplierId: supplier.id,
      invoiceNumber,
      issueDate,
      dueDate,
      currency: 'USD',
      totalCents: amountCents,
      totalBaseCents: amountCents,
      fxRate: 1,
      fxAsOf: DEMO_TODAY,
      lines: [
        {
          id: `inv_9${String(100 + i)}-l1`,
          description: supplier.description,
          quantity: 1,
          unitPriceCents: amountCents,
          amountCents,
        },
      ],
      poReference,
      bankDetailsOnInvoice: {
        holder: account.holder,
        accountNumber: account.accountNumber,
        country: account.country,
      },
      extractorConfidence: 90 + Math.floor(rand() * 10),
      state: historical ? 'paid' : 'received',
      sourceRef: `extractor:${invoiceNumber}`,
    });

    if (historical) {
      const runDate = thursdayOnOrBefore(dueDate);
      payments.push({
        id: `pay_9${String(100 + i)}`,
        invoiceId: `inv_9${String(100 + i)}`,
        fundingAccountId: supplier.funding,
        amountCents,
        currency: 'USD',
        scheduledFor: runDate,
        status: 'paid',
        runId: `run_${runDate}`,
      });
    }
  }

  return { invoices, purchaseOrders, payments };
}
