/**
 * Core domain types, generated from docs/BRIEF.md section 9.
 * Money is always integer minor units (cents) with an ISO currency code.
 * All rules evaluate in USD base amounts (amountBaseCents).
 */

// ---------------------------------------------------------------------------
// Outcome classes and reason kinds
// ---------------------------------------------------------------------------

/** Precedence: hard_stop > uncertainty > authority > routine. */
export type OutcomeClass = 'routine' | 'authority' | 'uncertainty' | 'hard_stop';

export const CLASS_SEVERITY: Record<OutcomeClass, number> = {
  routine: 0,
  authority: 1,
  uncertainty: 2,
  hard_stop: 3,
};

export type ReasonKind = 'trust' | 'conflict' | 'missing' | 'unavailable' | 'signature';

// ---------------------------------------------------------------------------
// Roles and users
// ---------------------------------------------------------------------------

export type Role = 'operator' | 'manager' | 'cfo';

export interface User {
  id: string; // usr_
  name: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type CurrencyCode = 'USD' | 'GBP' | 'EUR';

export interface Settings {
  baseCurrency: 'USD';
  displayCurrency: CurrencyCode;
  /** Fixed demo "today" so due dates and payment runs stay stable. */
  demoToday: string; // ISO date
  /** Units of foreign currency per 1 USD. Display + ingestion conversion only. */
  demoFxRates: Record<CurrencyCode, number>;
  fxAsOf: string; // ISO date
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface SupplierFact {
  id: string;
  text: string;
  setBy: string; // user id
  setAt: string; // ISO datetime
}

export interface Supplier {
  id: string; // sup_
  name: string;
  country: string; // ISO 3166-1 alpha-2
  status: 'unverified' | 'verified';
  defaultCurrency: CurrencyCode;
  category: string;
  paymentTermsDays: number;
  fundingAccountId: string;
  verifiedContact: { name: string; phone: string; email: string };
  facts: SupplierFact[];
}

export interface BankAccount {
  id: string; // ba_
  supplierId: string;
  holder: string;
  accountNumber: string; // synthetic
  country: string;
  status: 'verified' | 'pending' | 'superseded';
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface PurchaseOrderLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface PurchaseOrder {
  id: string; // po_ (reference used as display id, e.g. PO-5521)
  supplierId: string;
  reference: string; // e.g. PO-5521
  /**
   * standard: one order whose total the invoice should match (R05 tolerance).
   * blanket: an annual/recurring PO drawn down over many invoices; R05 does
   * not compare totals, and R04 guards the remaining balance.
   */
  kind: 'standard' | 'blanket';
  lines: PurchaseOrderLine[];
  totalCents: number;
  currency: CurrencyCode;
  balanceRemainingCents: number;
  status: 'open' | 'closed';
  requester: string;
}

export interface BankDetailsOnInvoice {
  holder: string;
  accountNumber: string;
  country: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  poLineRef?: string;
}

export type InvoiceState =
  | 'received'
  | 'checking'
  | 'ready'
  | 'awaiting_attention'
  | 'investigating'
  | 'on_hold'
  | 'blocked'
  | 'approved'
  | 'payment_scheduled'
  | 'paid'
  | 'rejected'
  | 'recovery';

export interface Invoice {
  id: string; // inv_
  supplierId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  totalCents: number; // in `currency`
  totalBaseCents: number; // in USD, converted at ingestion
  fxRate: number; // units of `currency` per 1 USD; 1 for USD
  fxAsOf: string;
  taxCents?: number;
  lines: InvoiceLine[];
  poReference?: string;
  bankDetailsOnInvoice: BankDetailsOnInvoice;
  extractorConfidence: number; // 0-100, from the simulated upstream extractor
  state: InvoiceState;
  sourceRef: string;
}

export interface Payment {
  id: string; // pay_
  invoiceId: string;
  fundingAccountId: string;
  amountCents: number;
  currency: CurrencyCode;
  scheduledFor: string;
  status: 'scheduled' | 'paid' | 'recalled';
  runId?: string;
}

export interface PaymentAccount {
  id: string; // acct_
  name: string;
  type: 'operating' | 'reserve' | 'foreign_currency';
  last4: string;
  currency: CurrencyCode;
  balanceCents: number;
  minimumBalanceCents: number;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type ConditionType =
  | 'bank_details_differ_from_verified'
  | 'supplier_not_verified'
  | 'exact_duplicate_exists'
  | 'po_closed_or_insufficient_balance'
  | 'amount_vs_po_beyond_tolerance'
  | 'po_required_but_missing'
  | 'required_field_missing_or_low_confidence'
  | 'amount_above_threshold'
  | 'currency_not_in_allowed_list'
  | 'payee_account_outside_home_country'
  | 'approver_role_limits' // enforced at the approval guard, not in evaluate()
  | 'funding_balance_below_minimum'; // R12: documented only, not built

export interface Rule {
  id: string; // R01..R12
  version: number;
  statement: string;
  conditionType: ConditionType;
  parameters: Record<string, unknown>;
  outcomeClass: OutcomeClass;
  kind: ReasonKind;
  scope: 'all' | 'supplier';
  locked: boolean;
  /** Who may edit parameters from the interface (locked rules need co-approval). */
  editableBy: 'none' | 'manager_or_cfo' | 'cfo_only';
  effectiveFrom: string;
  /** False for rules enforced elsewhere (R11 at the approval guard) or documented only (R12). */
  evaluatedInPipeline: boolean;
}

export interface Ruleset {
  version: number;
  rules: Rule[];
  /** Supplier-scoped parameter overrides: ruleId -> supplierId -> params. */
  supplierOverrides: Record<string, Record<string, Record<string, unknown>>>;
}

export interface RuleResult {
  invoiceId: string;
  ruleId: string;
  ruleVersion: number;
  fired: boolean;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceType =
  | 'invoice_field'
  | 'supplier_fact'
  | 'bank_record'
  | 'po_record'
  | 'prior_invoice'
  | 'payment_record'
  | 'rule_result'
  | 'computed_stat'
  | 'verification_record'
  | 'human_note';

export interface Evidence {
  id: string; // ev:<entity>:<id>:<field>
  type: EvidenceType;
  source: { entity: string; entityId: string; fieldPath: string };
  value: unknown;
  retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Reasons and gates
// ---------------------------------------------------------------------------

export type GateStatus = 'open' | 'cleared';

export interface Reason {
  id: string; // rsn_
  invoiceId: string;
  source: 'rule' | 'ai' | 'system';
  /** Rule id or AI job id that produced it. */
  sourceId: string;
  kind: ReasonKind;
  class: OutcomeClass;
  /** Fixed rank within class: rules by catalogue order, AI after rules. */
  rank: number;
  description: string;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type AIJob = 'J1' | 'J2' | 'J3' | 'J4' | 'J5';
export type Assessment = 'supports' | 'contradicts' | 'unclear';
export type AIProvenance = 'live' | 'recorded' | 'staged';
export type AIFailureType = 'timeout' | 'error' | 'schema_invalid' | 'unknown_evidence';

export interface Finding {
  job: AIJob;
  assessment: Assessment;
  description: string;
  evidenceIds: string[];
}

export interface AIOutput {
  findings: Finding[];
  proposedClass: OutcomeClass;
  proposedAction: string;
  brief: string;
}

export interface AIRun {
  id: string; // run_
  invoiceId: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  status: 'succeeded' | 'failed';
  failureType?: AIFailureType;
  provenance: AIProvenance;
  output?: AIOutput;
  validationResult: 'valid' | 'invalid' | 'not_applicable';
  createdAt: string;
}

/** Append-only verdict on an AI run. Never edits the run. */
export interface JudgmentReview {
  id: string;
  aiRunId: string;
  job: AIJob;
  verdict: 'confirmed' | 'false_alarm' | 'missed';
  setBy: string;
  setVia: 'correction' | 'dismissal' | 'spot_check';
  setAt: string;
}

// ---------------------------------------------------------------------------
// Decisions, verification, correction, audit
// ---------------------------------------------------------------------------

export interface Decision {
  id: string; // dec_
  invoiceId: string;
  userId: string;
  role: Role;
  action: string;
  reasonText: string;
  evidenceIdsSeen: string[];
  createdAt: string;
}

export interface Verification {
  id: string;
  invoiceId: string;
  step1: { userId: string; contactUsed: string; spokeTo: string; outcome: 'confirmed' | 'not_confirmed'; at: string };
  step2?: { userId: string; outcome: 'confirmed' | 'rejected'; at: string };
  createdAt: string;
}

export type CorrectionScope = 'this_invoice' | 'this_supplier' | 'rule_parameter' | 'new_logic';

export interface Correction {
  id: string;
  invoiceId: string;
  scope: CorrectionScope;
  change: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  supplierFactId?: string;
  ruleChangeId?: string;
}

export interface SpotCheck {
  id: string;
  invoiceId: string;
  sampledAt: string;
  reviewerId?: string;
  outcome?: 'confirmed' | 'flagged';
  note?: string;
}

export interface AuditEvent {
  id: string;
  invoiceId: string;
  actor: 'system' | 'ai' | 'user';
  actorId?: string;
  event: string;
  rulesetVersion: number;
  snapshotRef?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Assembled context (what the AI and the rule engine see)
// ---------------------------------------------------------------------------

export interface InvoiceContext {
  invoice: Invoice;
  supplier: Supplier;
  /** The supplier's verified bank accounts (the verified record). */
  verifiedBankAccounts: BankAccount[];
  po?: PurchaseOrder;
  /** Other invoices from the same supplier, newest first. Excludes this one. */
  priorInvoices: Invoice[];
  priorPayments: Payment[];
  rulesetVersion: number;
  evidence: Evidence[];
  /** Index of evidence by id for O(1) citation validation. */
  evidenceIds: Set<string>;
}
