import { usd } from '../money.js';
import type {
  BankDetailsOnInvoice,
  Invoice,
  InvoiceLine,
  InvoiceState,
  OutcomeClass,
  Payment,
  PurchaseOrder,
} from '../types.js';
import { verifiedAccountFor } from './company.js';

/**
 * Fixture anchors from docs/POLICY.md. IDs and amounts are fixed; dates are
 * relative to the demo "today", Tuesday 2025-10-14. Payment runs on Thursdays.
 */

function bankDetails(supplierId: string): BankDetailsOnInvoice {
  const account = verifiedAccountFor(supplierId);
  return { holder: account.holder, accountNumber: account.accountNumber, country: account.country };
}

function line(id: string, description: string, amountCents: number, quantity = 1): InvoiceLine {
  return { id, description, quantity, unitPriceCents: Math.round(amountCents / quantity), amountCents };
}

interface InvoiceSpec {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  lines: InvoiceLine[];
  poReference?: string;
  state: InvoiceState;
  bankOverride?: BankDetailsOnInvoice;
  extractorConfidence?: number;
}

function invoice(spec: InvoiceSpec): Invoice {
  return {
    id: spec.id,
    supplierId: spec.supplierId,
    invoiceNumber: spec.invoiceNumber,
    issueDate: spec.issueDate,
    dueDate: spec.dueDate,
    currency: 'USD',
    totalCents: spec.totalCents,
    totalBaseCents: spec.totalCents,
    fxRate: 1,
    fxAsOf: '2025-10-14',
    lines: spec.lines,
    poReference: spec.poReference,
    bankDetailsOnInvoice: spec.bankOverride ?? bankDetails(spec.supplierId),
    extractorConfidence: spec.extractorConfidence ?? 96,
    state: spec.state,
    sourceRef: `extractor:${spec.invoiceNumber}`,
  };
}

// ---------------------------------------------------------------------------
// Purchase orders (anchors + blanket POs that keep recurring billing clean)
// ---------------------------------------------------------------------------

function po(
  reference: string,
  supplierId: string,
  totalCents: number,
  balanceRemainingCents: number,
  status: 'open' | 'closed',
  description: string,
  kind: 'standard' | 'blanket' = 'standard',
): PurchaseOrder {
  return {
    id: `po_${reference.toLowerCase().replace('-', '_')}`,
    supplierId,
    reference,
    kind,
    lines: [line(`${reference}-l1`, description, totalCents)],
    totalCents,
    currency: 'USD',
    balanceRemainingCents,
    status,
    requester: 'usr_marcus',
  };
}

export const FIXTURE_POS: PurchaseOrder[] = [
  // Anchors named in docs/POLICY.md
  po('PO-5521', 'sup_001', usd(4_320), usd(4_320), 'open', 'Corrugated shipping cartons, Q4 restock'),
  po('PO-5598', 'sup_003', usd(620), usd(620), 'open', 'Pallet freight, Midwest route'),
  po('PO-5640', 'sup_004', usd(18_000), usd(18_000), 'open', 'Conveyor drive unit, warehouse 2'),
  po('PO-5190', 'sup_001', usd(6_200), 0, 'closed', 'Stretch wrap, Q2 order (fully invoiced)'),
  // Supporting POs so fixtures carry exactly the reasons the brief names
  po('PO-5540', 'sup_002', usd(22_320), usd(13_020), 'open', 'Monthly cleaning service, annual blanket PO', 'blanket'),
  po('PO-5610', 'sup_005', usd(7_950), usd(7_950), 'open', 'Heat-treated pallets, October order'),
  po('PO-5602', 'sup_006', usd(12_000), usd(7_320), 'open', 'Office supplies, annual blanket PO', 'blanket'),
  po('PO-5533', 'sup_007', usd(48_000), usd(29_450), 'open', 'Utilities, annual blanket PO', 'blanket'),
];

// ---------------------------------------------------------------------------
// Fixture invoices
// ---------------------------------------------------------------------------

/**
 * Scenario 5's invoice shows a bank account that differs from the verified
 * record — the classic payment-diversion pattern R01 exists for.
 */
const DIVERTED_ACCOUNT: BankDetailsOnInvoice = {
  holder: 'Evergreen Pallet Co.',
  accountNumber: 'SYN-005-US-ALT-2291',
  country: 'US',
};

export const FIXTURE_INVOICES: Invoice[] = [
  // Fixture 1 — routine. $4,320 matches PO-5521 to the cent. Due in 12 days.
  invoice({
    id: 'inv_1187',
    supplierId: 'sup_001',
    invoiceNumber: 'INV-1187',
    issueDate: '2025-09-26',
    dueDate: '2025-10-26',
    totalCents: usd(4_320),
    lines: [line('inv_1187-l1', 'Corrugated shipping cartons, Q4 restock', usd(4_320), 400)],
    poReference: 'PO-5521',
    state: 'received',
  }),

  // Fixture 2a — near-duplicate, true repeat of INV-2014 (April service, already paid).
  invoice({
    id: 'inv_2041',
    supplierId: 'sup_002',
    invoiceNumber: 'INV-2041',
    issueDate: '2025-10-10',
    dueDate: '2025-10-25',
    totalCents: usd(1_860),
    lines: [line('inv_2041-l1', 'Monthly cleaning service — April 2025', usd(1_860))],
    poReference: 'PO-5540',
    state: 'received',
  }),

  // Fixture 2b — legitimate monthly invoice for a different month. Staged: J1 wrongly flags it.
  invoice({
    id: 'inv_2087',
    supplierId: 'sup_002',
    invoiceNumber: 'INV-2087',
    issueDate: '2025-10-01',
    dueDate: '2025-10-16',
    totalCents: usd(1_860),
    lines: [line('inv_2087-l1', 'Monthly cleaning service — October 2025', usd(1_860))],
    poReference: 'PO-5540',
    state: 'received',
  }),

  // Fixture 3 — $680 against PO-5598 at $620: $60 over, beyond ±2% or $25, so R05 fires.
  invoice({
    id: 'inv_3302',
    supplierId: 'sup_003',
    invoiceNumber: 'INV-3302',
    issueDate: '2025-10-07',
    dueDate: '2025-11-06',
    totalCents: usd(680),
    lines: [
      line('inv_3302-l1', 'Pallet freight, Midwest route', usd(620)),
      line('inv_3302-l2', 'Fuel surcharge — freight', usd(60)),
    ],
    poReference: 'PO-5598',
    state: 'received',
  }),

  // Fixture 4 — valid $18,000 invoice. Everything checks out; R08 fires.
  invoice({
    id: 'inv_4410',
    supplierId: 'sup_004',
    invoiceNumber: 'INV-4410',
    issueDate: '2025-10-01',
    dueDate: '2025-11-15',
    totalCents: usd(18_000),
    lines: [line('inv_4410-l1', 'Conveyor drive unit, warehouse 2', usd(18_000))],
    poReference: 'PO-5640',
    state: 'received',
  }),

  // Fixture 5 — bank details on the invoice differ from the verified record. R01 fires.
  invoice({
    id: 'inv_5075',
    supplierId: 'sup_005',
    invoiceNumber: 'INV-5075',
    issueDate: '2025-09-30',
    dueDate: '2025-10-30',
    totalCents: usd(7_950),
    lines: [line('inv_5075-l1', 'Heat-treated pallets, October order', usd(7_950), 150)],
    poReference: 'PO-5610',
    state: 'received',
    bankOverride: DIVERTED_ACCOUNT,
  }),

  // Fixture 6a — true duplicate of INV-6119 (same goods, look-alike invoice number).
  // Staged: J1 wrongly judges it legitimate, so it proceeded as Routine.
  // The Thursday payment run (16 Oct) has not happened yet, so it can be pulled back.
  invoice({
    id: 'inv_6122',
    supplierId: 'sup_006',
    invoiceNumber: 'INV-6122',
    issueDate: '2025-10-08',
    dueDate: '2025-11-07',
    totalCents: usd(2_140),
    lines: [line('inv_6122-l1', 'Copy paper, toner and mailing supplies', usd(2_140))],
    poReference: 'PO-5602',
    state: 'payment_scheduled',
  }),

  // Fixture 6b — same shape, but the payment run has already executed. Recovery case.
  invoice({
    id: 'inv_7230',
    supplierId: 'sup_007',
    invoiceNumber: 'INV-7230',
    issueDate: '2025-10-02',
    dueDate: '2025-10-22',
    totalCents: usd(3_775),
    lines: [line('inv_7230-l1', 'Electricity and water — September 2025', usd(3_775))],
    poReference: 'PO-5533',
    state: 'paid',
  }),
];

/** Prior invoices the fixtures duplicate or recur against. All already paid. */
export const PRIOR_INVOICES: Invoice[] = [
  invoice({
    id: 'inv_2014',
    supplierId: 'sup_002',
    invoiceNumber: 'INV-2014',
    issueDate: '2025-04-02',
    dueDate: '2025-04-17',
    totalCents: usd(1_860),
    lines: [line('inv_2014-l1', 'Monthly cleaning service — April 2025', usd(1_860))],
    poReference: 'PO-5540',
    state: 'paid',
  }),
  invoice({
    id: 'inv_6119',
    supplierId: 'sup_006',
    invoiceNumber: 'INV-6119',
    issueDate: '2025-10-06',
    dueDate: '2025-11-05',
    totalCents: usd(2_140),
    lines: [line('inv_6119-l1', 'Copy paper, toner and mailing supplies', usd(2_140))],
    poReference: 'PO-5602',
    state: 'paid',
  }),
  invoice({
    id: 'inv_7198',
    supplierId: 'sup_007',
    invoiceNumber: 'INV-7198',
    issueDate: '2025-09-29',
    dueDate: '2025-10-19',
    totalCents: usd(3_775),
    lines: [line('inv_7198-l1', 'Electricity and water — September 2025', usd(3_775))],
    poReference: 'PO-5533',
    state: 'paid',
  }),
];

/** Payments for the seeded paid/scheduled invoices. Runs are Thursdays. */
export const FIXTURE_PAYMENTS: Payment[] = [
  { id: 'pay_2014', invoiceId: 'inv_2014', fundingAccountId: 'acct_pay', amountCents: usd(1_860), currency: 'USD', scheduledFor: '2025-04-17', status: 'paid', runId: 'run_2025-04-17' },
  { id: 'pay_6119', invoiceId: 'inv_6119', fundingAccountId: 'acct_ops', amountCents: usd(2_140), currency: 'USD', scheduledFor: '2025-10-09', status: 'paid', runId: 'run_2025-10-09' },
  { id: 'pay_6122', invoiceId: 'inv_6122', fundingAccountId: 'acct_ops', amountCents: usd(2_140), currency: 'USD', scheduledFor: '2025-10-16', status: 'scheduled' },
  { id: 'pay_7198', invoiceId: 'inv_7198', fundingAccountId: 'acct_pay', amountCents: usd(3_775), currency: 'USD', scheduledFor: '2025-10-09', status: 'paid', runId: 'run_2025-10-09' },
  { id: 'pay_7230', invoiceId: 'inv_7230', fundingAccountId: 'acct_pay', amountCents: usd(3_775), currency: 'USD', scheduledFor: '2025-10-09', status: 'paid', runId: 'run_2025-10-09' },
];

// ---------------------------------------------------------------------------
// Expected outcomes, straight from the scenario matrix (brief section 11).
// Tests assert these; the demo uses them to label fixtures.
// ---------------------------------------------------------------------------

export interface FixtureExpectation {
  fixture: string;
  invoiceId: string;
  invoiceNumber: string;
  expectedFiredRules: string[];
  expectedFloor: OutcomeClass;
  /** Final class once the (possibly staged) AI output is merged. */
  expectedFinalClass: OutcomeClass;
  provenance: 'live' | 'staged';
  note: string;
}

export const FIXTURE_EXPECTATIONS: FixtureExpectation[] = [
  { fixture: '1', invoiceId: 'inv_1187', invoiceNumber: 'INV-1187', expectedFiredRules: [], expectedFloor: 'routine', expectedFinalClass: 'routine', provenance: 'live', note: 'Routine work stays invisible.' },
  { fixture: '2a', invoiceId: 'inv_2041', invoiceNumber: 'INV-2041', expectedFiredRules: [], expectedFloor: 'routine', expectedFinalClass: 'uncertainty', provenance: 'live', note: 'J1 judges INV-2041 a likely repeat of INV-2014. The AI alone caused the interruption.' },
  { fixture: '2b', invoiceId: 'inv_2087', invoiceNumber: 'INV-2087', expectedFiredRules: [], expectedFloor: 'routine', expectedFinalClass: 'uncertainty', provenance: 'staged', note: 'Staged false alarm: J1 wrongly flags a legitimate monthly invoice.' },
  { fixture: '3', invoiceId: 'inv_3302', invoiceNumber: 'INV-3302', expectedFiredRules: ['R05'], expectedFloor: 'uncertainty', expectedFinalClass: 'uncertainty', provenance: 'live', note: 'R05 fires; J2 explains the $60 freight line.' },
  { fixture: '4', invoiceId: 'inv_4410', invoiceNumber: 'INV-4410', expectedFiredRules: ['R08'], expectedFloor: 'authority', expectedFinalClass: 'authority', provenance: 'live', note: 'Everything checks out and a person is still required.' },
  { fixture: '5', invoiceId: 'inv_5075', invoiceNumber: 'INV-5075', expectedFiredRules: ['R01'], expectedFloor: 'hard_stop', expectedFinalClass: 'hard_stop', provenance: 'live', note: 'The rule decides, the AI explains, the verification path clears it.' },
  { fixture: '6a', invoiceId: 'inv_6122', invoiceNumber: 'INV-6122', expectedFiredRules: [], expectedFloor: 'routine', expectedFinalClass: 'routine', provenance: 'staged', note: 'Staged miss: a true duplicate proceeds as Routine; caught before the payment run.' },
  { fixture: '6b', invoiceId: 'inv_7230', invoiceNumber: 'INV-7230', expectedFiredRules: [], expectedFloor: 'routine', expectedFinalClass: 'routine', provenance: 'staged', note: 'Staged miss caught after the payment run: a recovery case opens.' },
];
