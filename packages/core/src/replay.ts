import { assembleContext, type ContextSources } from './context';
import { evaluate, ruleFloor } from './rules/engine';
import type { OutcomeClass, Ruleset } from './types';

/**
 * The consequence preview (brief section 5): because the engine is pure, a
 * proposed rule change can be replayed against the synthetic invoice history
 * before it is saved. Rules only — no AI call — so it is a rule-floor what-if.
 */

export interface ReplayChange {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  totalBaseCents: number;
  state: string;
  firedBefore: boolean;
  firedAfter: boolean;
  floorBefore: OutcomeClass;
  floorAfter: OutcomeClass;
}

export interface ReplayPreview {
  ruleId: string;
  /** Invoices whose fired status for this rule, or rule floor, would change. */
  changed: ReplayChange[];
  /** Of those, the ones that would stop firing this rule (e.g. auto-process). */
  noLongerFiring: ReplayChange[];
  newlyFiring: ReplayChange[];
}

export function withRuleParameters(ruleset: Ruleset, ruleId: string, parameters: Record<string, unknown>): Ruleset {
  return {
    ...ruleset,
    rules: ruleset.rules.map((r) => (r.id === ruleId ? { ...r, parameters: { ...r.parameters, ...parameters } } : r)),
  };
}

export function replayRuleChange(
  db: ContextSources,
  ruleset: Ruleset,
  ruleId: string,
  newParameters: Record<string, unknown>,
  now: string,
): ReplayPreview {
  const proposed = withRuleParameters(ruleset, ruleId, newParameters);
  const changed: ReplayChange[] = [];

  for (const invoice of db.invoices) {
    const context = assembleContext(invoice, db, now);
    const before = evaluate(invoice, context, ruleset);
    const after = evaluate(invoice, context, proposed);
    const firedBefore = before.some((r) => r.ruleId === ruleId && r.fired);
    const firedAfter = after.some((r) => r.ruleId === ruleId && r.fired);
    const floorBefore = ruleFloor(before, ruleset);
    const floorAfter = ruleFloor(after, proposed);
    if (firedBefore !== firedAfter || floorBefore !== floorAfter) {
      changed.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: invoice.supplierId,
        totalBaseCents: invoice.totalBaseCents,
        state: invoice.state,
        firedBefore,
        firedAfter,
        floorBefore,
        floorAfter,
      });
    }
  }

  return {
    ruleId,
    changed,
    noLongerFiring: changed.filter((c) => c.firedBefore && !c.firedAfter),
    newlyFiring: changed.filter((c) => !c.firedBefore && c.firedAfter),
  };
}
