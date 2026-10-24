import { describe, expect, it } from 'vitest';
import { evidenceId } from '../src/evidence';
import { merge } from '../src/merge';
import { gatesInResolutionOrder, primaryReason, sortReasons } from '../src/reasons';
import { evaluate } from '../src/rules/engine';
import type { AIOutput } from '../src/types';
import { CLASS_SEVERITY } from '../src/types';
import { seedAndContext } from './helpers';

function aiOutput(proposedClass: AIOutput['proposedClass'], evidenceRef: string): AIOutput {
  return {
    findings: [
      { job: 'J1', assessment: 'unclear', description: 'A prior invoice looks similar.', evidenceIds: [evidenceRef] },
    ],
    proposedClass,
    proposedAction: 'review',
    brief: 'Synthetic brief for tests.',
  };
}

describe('class precedence', () => {
  it('Hard stop > Uncertainty > Authority > Routine', () => {
    expect(CLASS_SEVERITY.hard_stop).toBeGreaterThan(CLASS_SEVERITY.uncertainty);
    expect(CLASS_SEVERITY.uncertainty).toBeGreaterThan(CLASS_SEVERITY.authority);
    expect(CLASS_SEVERITY.authority).toBeGreaterThan(CLASS_SEVERITY.routine);
  });
});

describe('merge (step 6): the AI can only raise, never lower', () => {
  it('AI proposing routine cannot lower an Authority floor (R08, fixture 4)', () => {
    const { seed, invoice, context } = seedAndContext('inv_4410');
    const results = evaluate(invoice, context, seed.ruleset);
    const ref = evidenceId('invoice', invoice.invoiceNumber, 'total');
    const merged = merge(invoice, results, { status: 'succeeded', output: aiOutput('routine', ref) }, seed.ruleset);
    expect(merged.floor).toBe('authority');
    expect(merged.finalClass).toBe('authority');
  });

  it('AI proposing routine cannot lower a Hard stop floor (R01, fixture 5)', () => {
    const { seed, invoice, context } = seedAndContext('inv_5075');
    const results = evaluate(invoice, context, seed.ruleset);
    const ref = evidenceId('invoice', invoice.invoiceNumber, 'total');
    const merged = merge(invoice, results, { status: 'succeeded', output: aiOutput('routine', ref) }, seed.ruleset);
    expect(merged.finalClass).toBe('hard_stop');
  });

  it('AI raises a Routine floor to Uncertainty (fixture 2a)', () => {
    const { seed, invoice, context } = seedAndContext('inv_2041');
    const results = evaluate(invoice, context, seed.ruleset);
    const ref = evidenceId('prior_invoice', 'INV-2014', 'invoice_number');
    const merged = merge(invoice, results, { status: 'succeeded', output: aiOutput('uncertainty', ref) }, seed.ruleset);
    expect(merged.floor).toBe('routine');
    expect(merged.finalClass).toBe('uncertainty');
    expect(merged.reasons.some((r) => r.source === 'ai')).toBe(true);
  });

  it('fails closed: an AI failure becomes Uncertainty (Unavailable), never Routine', () => {
    const { seed, invoice, context } = seedAndContext('inv_1187');
    const results = evaluate(invoice, context, seed.ruleset);
    const merged = merge(invoice, results, { status: 'failed', failureType: 'timeout' }, seed.ruleset);
    expect(merged.finalClass).toBe('uncertainty');
    const reason = merged.reasons.find((r) => r.kind === 'unavailable');
    expect(reason).toBeDefined();
    expect(reason?.source).toBe('system');
  });

  it('an AI failure never lowers a Hard stop floor', () => {
    const { seed, invoice, context } = seedAndContext('inv_5075');
    const results = evaluate(invoice, context, seed.ruleset);
    const merged = merge(invoice, results, { status: 'failed', failureType: 'schema_invalid' }, seed.ruleset);
    expect(merged.finalClass).toBe('hard_stop');
    expect(merged.reasons.some((r) => r.kind === 'unavailable')).toBe(true);
  });
});

describe('reason ordering and gates', () => {
  it('the primary reason is the fired rule, and an AI finding at the same class adds nothing', () => {
    const { seed, invoice, context } = seedAndContext('inv_3302'); // R05 fires (uncertainty)
    const results = evaluate(invoice, context, seed.ruleset);
    const ref = evidenceId('invoice', invoice.invoiceNumber, 'total');
    const merged = merge(invoice, results, { status: 'succeeded', output: aiOutput('uncertainty', ref) }, seed.ruleset);
    expect(primaryReason(merged.reasons)?.sourceId).toBe('R05');
    // The AI proposal did not raise the class above the rule floor, so it adds no reason.
    expect(merged.reasons.every((r) => r.source === 'rule')).toBe(true);
  });

  it('within a class, rule reasons rank before AI reasons', () => {
    const base = { invoiceId: 'x', kind: 'conflict' as const, class: 'uncertainty' as const, description: '', evidenceIds: [] };
    const ai = { ...base, id: 'a', source: 'ai' as const, sourceId: 'J1', rank: 100 };
    const rule = { ...base, id: 'b', source: 'rule' as const, sourceId: 'R05', rank: 5 };
    expect(sortReasons([ai, rule]).map((r) => r.sourceId)).toEqual(['R05', 'J1']);
  });

  it('gate resolution order: hard stop, then uncertainty, then authority last', () => {
    const reasons = [
      { id: 'a', invoiceId: 'x', source: 'rule' as const, sourceId: 'R08', kind: 'signature' as const, class: 'authority' as const, rank: 8, description: '', evidenceIds: [] },
      { id: 'b', invoiceId: 'x', source: 'rule' as const, sourceId: 'R05', kind: 'conflict' as const, class: 'uncertainty' as const, rank: 5, description: '', evidenceIds: [] },
      { id: 'c', invoiceId: 'x', source: 'rule' as const, sourceId: 'R01', kind: 'trust' as const, class: 'hard_stop' as const, rank: 1, description: '', evidenceIds: [] },
    ];
    expect(gatesInResolutionOrder(reasons).map((r) => r.sourceId)).toEqual(['R01', 'R05', 'R08']);
  });
});
