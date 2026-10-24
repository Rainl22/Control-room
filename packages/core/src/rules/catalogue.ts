import { usd } from '../money';
import type { Rule, Ruleset } from '../types';

const EFFECTIVE = '2025-01-01';

/**
 * Starter rule catalogue, docs/BRIEF.md section 10. All amounts are USD cents.
 * Within a class, a lower ID means a higher rank.
 */
export const RULES: Rule[] = [
  {
    id: 'R01',
    version: 1,
    statement: 'Bank details on the invoice differ from the verified record.',
    conditionType: 'bank_details_differ_from_verified',
    parameters: {},
    outcomeClass: 'hard_stop',
    kind: 'trust',
    scope: 'all',
    locked: true,
    editableBy: 'none',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R02',
    version: 1,
    statement: 'Supplier is not verified.',
    conditionType: 'supplier_not_verified',
    parameters: {},
    outcomeClass: 'hard_stop',
    kind: 'trust',
    scope: 'all',
    locked: true,
    editableBy: 'none',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R03',
    version: 1,
    statement: 'Exact duplicate: same supplier and invoice number as an existing invoice.',
    conditionType: 'exact_duplicate_exists',
    parameters: {},
    outcomeClass: 'uncertainty',
    kind: 'conflict',
    scope: 'all',
    locked: true,
    editableBy: 'none',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R04',
    version: 1,
    statement: 'PO is closed, or its remaining balance is insufficient.',
    conditionType: 'po_closed_or_insufficient_balance',
    parameters: {},
    outcomeClass: 'uncertainty',
    kind: 'conflict',
    scope: 'all',
    locked: true,
    editableBy: 'none',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R05',
    version: 1,
    statement: 'Amount differs from the PO beyond tolerance (±2% or $25, whichever is greater).',
    conditionType: 'amount_vs_po_beyond_tolerance',
    parameters: { tolerancePct: 2, toleranceAbsCents: usd(25) },
    outcomeClass: 'uncertainty',
    kind: 'conflict',
    scope: 'supplier',
    locked: false,
    editableBy: 'manager_or_cfo',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R06',
    version: 1,
    statement: 'A PO is required above $500 but the invoice has no PO reference.',
    conditionType: 'po_required_but_missing',
    parameters: { poRequiredAboveCents: usd(500) },
    outcomeClass: 'uncertainty',
    kind: 'missing',
    scope: 'all',
    locked: false,
    editableBy: 'manager_or_cfo',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R07',
    version: 1,
    statement: 'A required field is missing, or extractor confidence is below 85%.',
    conditionType: 'required_field_missing_or_low_confidence',
    parameters: { minConfidence: 85 },
    outcomeClass: 'uncertainty',
    kind: 'missing',
    scope: 'all',
    locked: false,
    editableBy: 'manager_or_cfo',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R08',
    version: 1,
    statement: 'Amount is above the $10,000 approval threshold.',
    conditionType: 'amount_above_threshold',
    parameters: { thresholdCents: usd(10_000) },
    outcomeClass: 'authority',
    kind: 'signature',
    scope: 'all',
    locked: false,
    editableBy: 'cfo_only',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R09',
    version: 1,
    statement: 'Currency is outside the allowed list (USD). Needs Manager approval at any amount.',
    conditionType: 'currency_not_in_allowed_list',
    parameters: { allowedCurrencies: ['USD'] },
    outcomeClass: 'authority',
    kind: 'signature',
    scope: 'all',
    locked: false,
    editableBy: 'manager_or_cfo',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R10',
    version: 1,
    statement: 'Payee bank account is outside the home country (US). Needs Manager approval at any amount.',
    conditionType: 'payee_account_outside_home_country',
    parameters: { homeCountry: 'US' },
    outcomeClass: 'authority',
    kind: 'signature',
    scope: 'all',
    locked: false,
    editableBy: 'manager_or_cfo',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: true,
  },
  {
    id: 'R11',
    version: 1,
    statement: 'Approver role limits: Manager up to $50,000, then CFO. Applied at the approval guard.',
    conditionType: 'approver_role_limits',
    parameters: { managerLimitCents: usd(50_000) },
    outcomeClass: 'authority',
    kind: 'signature',
    scope: 'all',
    locked: false,
    editableBy: 'cfo_only',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: false,
  },
  {
    id: 'R12',
    version: 1,
    statement:
      'Funding account balance after scheduled payments would fall below its minimum. Documented only, not built.',
    conditionType: 'funding_balance_below_minimum',
    parameters: { note: 'minimum balance per account; see PaymentAccount.minimumBalanceCents' },
    outcomeClass: 'uncertainty',
    kind: 'conflict',
    scope: 'all',
    locked: false,
    editableBy: 'manager_or_cfo',
    effectiveFrom: EFFECTIVE,
    evaluatedInPipeline: false,
  },
];

export function starterRuleset(): Ruleset {
  return {
    version: 1,
    rules: RULES.map((r) => ({ ...r, parameters: { ...r.parameters } })),
    // sup_009 carries the supplier-scoped tolerance example from docs/POLICY.md.
    supplierOverrides: {
      R05: { sup_009: { tolerancePct: 5, toleranceAbsCents: usd(25) } },
    },
  };
}

export function getRule(ruleset: Ruleset, id: string): Rule {
  const rule = ruleset.rules.find((r) => r.id === id);
  if (!rule) throw new Error(`unknown rule ${id}`);
  return rule;
}

/** Catalogue rank: position within the catalogue (lower = higher rank within a class). */
export function ruleRank(ruleId: string): number {
  const n = Number(ruleId.slice(1));
  if (!Number.isInteger(n)) throw new Error(`bad rule id ${ruleId}`);
  return n;
}
