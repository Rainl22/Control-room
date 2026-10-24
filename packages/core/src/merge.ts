import { classMax, reasonsFromAIOutput, reasonsFromRuleResults, sortReasons, unavailableReason } from './reasons.js';
import { ruleFloor } from './rules/engine.js';
import type { AIFailureType, AIOutput, Invoice, OutcomeClass, Reason, RuleResult, Ruleset } from './types.js';

export type AIRunOutcome =
  | { status: 'succeeded'; output: AIOutput }
  | { status: 'failed'; failureType: AIFailureType };

export interface MergeResult {
  finalClass: OutcomeClass;
  floor: OutcomeClass;
  reasons: Reason[];
}

/**
 * Step 6 of the pipeline. The final class is the higher of the rule floor and
 * the AI's proposal: the AI can only raise the floor, never lower it. If the
 * AI call failed or returned invalid output, the invoice becomes Uncertainty
 * (Unavailable). It never defaults to Routine.
 */
export function merge(
  invoice: Invoice,
  ruleResults: RuleResult[],
  ai: AIRunOutcome,
  ruleset: Ruleset,
): MergeResult {
  const floor = ruleFloor(ruleResults, ruleset);
  const reasons = reasonsFromRuleResults(invoice, ruleResults, ruleset);

  if (ai.status === 'failed') {
    reasons.push(unavailableReason(invoice, ai.failureType));
    return { finalClass: classMax(floor, 'uncertainty'), floor, reasons: sortReasons(reasons) };
  }

  reasons.push(...reasonsFromAIOutput(invoice, ai.output, floor));
  return {
    finalClass: classMax(floor, ai.output.proposedClass),
    floor,
    reasons: sortReasons(reasons),
  };
}
