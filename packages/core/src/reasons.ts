import { getRule, ruleRank } from './rules/catalogue';
import type {
  AIFailureType,
  AIOutput,
  Invoice,
  OutcomeClass,
  Reason,
  RuleResult,
  Ruleset,
} from './types';
import { CLASS_SEVERITY } from './types';

export function classMax(a: OutcomeClass, b: OutcomeClass): OutcomeClass {
  return CLASS_SEVERITY[a] >= CLASS_SEVERITY[b] ? a : b;
}

/** AI-sourced reasons rank after every rule reason in the same class. */
const AI_RANK_OFFSET = 100;

/** Every rule hit becomes a reason. */
export function reasonsFromRuleResults(
  invoice: Invoice,
  results: RuleResult[],
  ruleset: Ruleset,
): Reason[] {
  return results
    .filter((r) => r.fired)
    .map((result) => {
      const rule = getRule(ruleset, result.ruleId);
      return {
        id: `rsn_${invoice.id}_${rule.id}`,
        invoiceId: invoice.id,
        source: 'rule' as const,
        sourceId: rule.id,
        kind: rule.kind,
        class: rule.outcomeClass,
        rank: ruleRank(rule.id),
        description: rule.statement,
        evidenceIds: result.evidenceIds,
      };
    });
}

/** Every AI finding that raises the class above the rule floor becomes a reason. */
export function reasonsFromAIOutput(
  invoice: Invoice,
  output: AIOutput,
  floor: OutcomeClass,
): Reason[] {
  if (CLASS_SEVERITY[output.proposedClass] <= CLASS_SEVERITY[floor]) return [];
  const raising = output.findings.filter((f) => f.assessment !== 'supports');
  return raising.map((finding, index) => ({
    id: `rsn_${invoice.id}_ai_${finding.job}_${index}`,
    invoiceId: invoice.id,
    source: 'ai' as const,
    sourceId: finding.job,
    kind: output.proposedClass === 'hard_stop' ? ('trust' as const) : ('conflict' as const),
    class: output.proposedClass,
    rank: AI_RANK_OFFSET + index,
    description: finding.description,
    evidenceIds: finding.evidenceIds,
  }));
}

/** A failed or invalid AI run becomes Uncertainty (Unavailable). Never Routine. */
export function unavailableReason(invoice: Invoice, failureType: AIFailureType): Reason {
  return {
    id: `rsn_${invoice.id}_unavailable`,
    invoiceId: invoice.id,
    source: 'system',
    sourceId: `ai_failure:${failureType}`,
    kind: 'unavailable',
    class: 'uncertainty',
    rank: AI_RANK_OFFSET,
    description: `The AI check didn't finish (${failureType.replace('_', ' ')}), so nobody has a second opinion on this one. Please review it yourself.`,
    evidenceIds: [],
  };
}

/**
 * Ordering: highest class first; within a class, lowest rank first
 * (rule reasons by catalogue order, AI reasons after rule reasons).
 */
export function sortReasons(reasons: Reason[]): Reason[] {
  return [...reasons].sort((a, b) => {
    const bySeverity = CLASS_SEVERITY[b.class] - CLASS_SEVERITY[a.class];
    if (bySeverity !== 0) return bySeverity;
    return a.rank - b.rank;
  });
}

export function primaryReason(reasons: Reason[]): Reason | undefined {
  return sortReasons(reasons)[0];
}

/** A reason in class Authority or above is a gate. */
export function isGate(reason: Reason): boolean {
  return CLASS_SEVERITY[reason.class] >= CLASS_SEVERITY.authority;
}

/**
 * Gate resolution order: Hard stop first, then Uncertainty, then Authority.
 * Approval is always last, so nobody signs for something not yet understood.
 */
export function gatesInResolutionOrder(reasons: Reason[]): Reason[] {
  const order: Record<OutcomeClass, number> = { hard_stop: 0, uncertainty: 1, authority: 2, routine: 3 };
  return reasons
    .filter(isGate)
    .sort((a, b) => (order[a.class] - order[b.class]) || (a.rank - b.rank));
}
