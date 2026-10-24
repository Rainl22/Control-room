import { evidenceId } from '../evidence';
import type {
  ConditionType,
  Invoice,
  InvoiceContext,
  OutcomeClass,
  Rule,
  RuleResult,
  Ruleset,
} from '../types';
import { CLASS_SEVERITY } from '../types';

/**
 * The rule engine: a pure function. No AI, no network, no side effects.
 * evaluate(invoice, context, ruleset) -> rule results.
 */

interface ConditionOutcome {
  fired: boolean;
  evidenceIds: string[];
}

type Evaluator = (
  invoice: Invoice,
  context: InvoiceContext,
  params: Record<string, unknown>,
) => ConditionOutcome;

/** Required invoice fields, mapped to their evidence field paths. */
const REQUIRED_INVOICE_FIELDS: Array<[key: string, fieldPath: string]> = [
  ['supplierId', 'supplier_id'],
  ['invoiceNumber', 'invoice_number'],
  ['issueDate', 'issue_date'],
  ['dueDate', 'due_date'],
  ['currency', 'currency'],
  ['totalCents', 'total'],
  ['bankDetailsOnInvoice', 'bank_details_on_invoice'],
];

const evaluators: Record<ConditionType, Evaluator> = {
  bank_details_differ_from_verified: (invoice, ctx) => {
    const match = ctx.verifiedBankAccounts.find(
      (a) => a.accountNumber === invoice.bankDetailsOnInvoice.accountNumber,
    );
    const ids = [evidenceId('invoice', invoice.invoiceNumber, 'bank_details_on_invoice')];
    if (match) ids.push(evidenceId('bank', match.id, 'account_number'));
    else ids.push(...ctx.verifiedBankAccounts.map((a) => evidenceId('bank', a.id, 'account_number')));
    return { fired: !match, evidenceIds: ids };
  },

  supplier_not_verified: (_invoice, ctx) => ({
    fired: ctx.supplier.status !== 'verified',
    evidenceIds: [evidenceId('supplier', ctx.supplier.id, 'status')],
  }),

  exact_duplicate_exists: (invoice, ctx) => {
    const dup = ctx.priorInvoices.find((p) => p.invoiceNumber === invoice.invoiceNumber);
    const ids = [evidenceId('invoice', invoice.invoiceNumber, 'invoice_number')];
    if (dup) ids.push(evidenceId('prior_invoice', dup.invoiceNumber, 'invoice_number'));
    return { fired: !!dup, evidenceIds: ids };
  },

  po_closed_or_insufficient_balance: (invoice, ctx) => {
    if (!ctx.po) return { fired: false, evidenceIds: [] };
    const closed = ctx.po.status === 'closed';
    // A blanket PO is drawn down invoice by invoice, so its remaining balance
    // must cover this invoice. A standard PO is exhausted once fully invoiced
    // (balance 0); an amount above its total is R05's conflict, not R04's.
    const insufficient =
      ctx.po.kind === 'blanket'
        ? ctx.po.balanceRemainingCents < invoice.totalBaseCents
        : ctx.po.balanceRemainingCents <= 0;
    return {
      fired: closed || insufficient,
      evidenceIds: [
        evidenceId('po', ctx.po.reference, 'status'),
        evidenceId('po', ctx.po.reference, 'balance_remaining'),
        evidenceId('invoice', invoice.invoiceNumber, 'total'),
      ],
    };
  },

  amount_vs_po_beyond_tolerance: (invoice, ctx, params) => {
    // Blanket POs are drawn down over many invoices; their balance is guarded
    // by R04, and a total-vs-total comparison would always "differ".
    if (!ctx.po || ctx.po.kind === 'blanket') return { fired: false, evidenceIds: [] };
    const pct = Number(params.tolerancePct);
    const abs = Number(params.toleranceAbsCents);
    const tolerance = Math.max(Math.round((ctx.po.totalCents * pct) / 100), abs);
    const diff = Math.abs(invoice.totalBaseCents - ctx.po.totalCents);
    return {
      fired: diff > tolerance,
      evidenceIds: [
        evidenceId('invoice', invoice.invoiceNumber, 'total'),
        evidenceId('po', ctx.po.reference, 'total'),
      ],
    };
  },

  po_required_but_missing: (invoice, _ctx, params) => {
    const threshold = Number(params.poRequiredAboveCents);
    const fired = !invoice.poReference && invoice.totalBaseCents > threshold;
    return {
      fired,
      evidenceIds: [
        evidenceId('invoice', invoice.invoiceNumber, 'po_reference'),
        evidenceId('invoice', invoice.invoiceNumber, 'total'),
      ],
    };
  },

  required_field_missing_or_low_confidence: (invoice, _ctx, params) => {
    const minConfidence = Number(params.minConfidence);
    const missing = REQUIRED_INVOICE_FIELDS.filter(([key]) => {
      const v = (invoice as unknown as Record<string, unknown>)[key];
      return v === undefined || v === null || v === '';
    });
    const noLines = invoice.lines.length === 0;
    const lowConfidence = invoice.extractorConfidence < minConfidence;
    const ids = [evidenceId('invoice', invoice.invoiceNumber, 'extractor_confidence')];
    for (const [, fieldPath] of missing) ids.push(evidenceId('invoice', invoice.invoiceNumber, fieldPath));
    if (noLines) ids.push(evidenceId('invoice', invoice.invoiceNumber, 'lines'));
    return { fired: missing.length > 0 || noLines || lowConfidence, evidenceIds: ids };
  },

  amount_above_threshold: (invoice, _ctx, params) => ({
    fired: invoice.totalBaseCents > Number(params.thresholdCents),
    evidenceIds: [evidenceId('invoice', invoice.invoiceNumber, 'total')],
  }),

  currency_not_in_allowed_list: (invoice, _ctx, params) => ({
    fired: !(params.allowedCurrencies as string[]).includes(invoice.currency),
    evidenceIds: [evidenceId('invoice', invoice.invoiceNumber, 'currency')],
  }),

  payee_account_outside_home_country: (invoice, ctx, params) => {
    const home = String(params.homeCountry);
    // The payee is the account that would be paid: the verified record if the
    // invoice's details match it, otherwise the details printed on the invoice.
    const match = ctx.verifiedBankAccounts.find(
      (a) => a.accountNumber === invoice.bankDetailsOnInvoice.accountNumber,
    );
    const country = match ? match.country : invoice.bankDetailsOnInvoice.country;
    const ids = match
      ? [evidenceId('bank', match.id, 'country')]
      : [evidenceId('invoice', invoice.invoiceNumber, 'bank_details_on_invoice')];
    return { fired: country !== home, evidenceIds: ids };
  },

  // Enforced at the approval guard (see statemachine.ts / permissions.ts), never in the pipeline.
  approver_role_limits: () => ({ fired: false, evidenceIds: [] }),

  // R12: documented only, not built.
  funding_balance_below_minimum: () => ({ fired: false, evidenceIds: [] }),
};

function effectiveParams(rule: Rule, ruleset: Ruleset, supplierId: string): Record<string, unknown> {
  const override = ruleset.supplierOverrides[rule.id]?.[supplierId];
  return override ? { ...rule.parameters, ...override } : rule.parameters;
}

/** Runs every active rule. Pure: same input, same output. */
export function evaluate(invoice: Invoice, context: InvoiceContext, ruleset: Ruleset): RuleResult[] {
  return ruleset.rules
    .filter((r) => r.evaluatedInPipeline)
    .map((rule) => {
      const outcome = evaluators[rule.conditionType](
        invoice,
        context,
        effectiveParams(rule, ruleset, invoice.supplierId),
      );
      return {
        invoiceId: invoice.id,
        ruleId: rule.id,
        ruleVersion: rule.version,
        fired: outcome.fired,
        evidenceIds: outcome.fired ? outcome.evidenceIds : [],
      };
    });
}

/** The rule floor: the highest class any fired rule produced. */
export function ruleFloor(results: RuleResult[], ruleset: Ruleset): OutcomeClass {
  let floor: OutcomeClass = 'routine';
  for (const result of results) {
    if (!result.fired) continue;
    const rule = ruleset.rules.find((r) => r.id === result.ruleId);
    if (!rule) throw new Error(`result cites unknown rule ${result.ruleId}`);
    if (CLASS_SEVERITY[rule.outcomeClass] > CLASS_SEVERITY[floor]) floor = rule.outcomeClass;
  }
  return floor;
}
