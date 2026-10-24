import { describe, expect, it } from 'vitest';
import { validateAIOutput } from '../src/ai/schema.js';
import { evidenceId } from '../src/evidence.js';
import { seedAndContext } from './helpers.js';

const validOutput = (evidenceRef: string) => ({
  findings: [
    { job: 'J5', assessment: 'supports', description: 'Amount matches the PO.', evidenceIds: [evidenceRef] },
  ],
  proposedClass: 'routine',
  proposedAction: 'proceed',
  brief: 'Everything matches the purchase order and the verified record.',
});

describe('AI output validation (the output contract)', () => {
  it('accepts a well-formed output citing known evidence', () => {
    const { context } = seedAndContext('inv_1187');
    const ref = evidenceId('invoice', 'INV-1187', 'total');
    const result = validateAIOutput(validOutput(ref), context.evidenceIds);
    expect(result.ok).toBe(true);
  });

  it('rejects output citing evidence that was never in the context', () => {
    const { context } = seedAndContext('inv_1187');
    const result = validateAIOutput(validOutput('ev:po:PO-9999:total'), context.evidenceIds);
    expect(result).toMatchObject({ ok: false, failureType: 'unknown_evidence' });
  });

  it('rejects structurally invalid output', () => {
    const { context } = seedAndContext('inv_1187');
    for (const bad of [
      null,
      {},
      { findings: [], proposedClass: 'approve_now', proposedAction: 'x', brief: 'x' },
      { findings: [{ job: 'J9', assessment: 'supports', description: 'x', evidenceIds: ['y'] }], proposedClass: 'routine', proposedAction: 'x', brief: 'x' },
    ]) {
      expect(validateAIOutput(bad, context.evidenceIds).ok).toBe(false);
    }
  });

  it('rejects a finding with no cited evidence — every claim cites evidence', () => {
    const { context } = seedAndContext('inv_1187');
    const output = {
      ...validOutput('x'),
      findings: [{ job: 'J5', assessment: 'supports', description: 'Trust me.', evidenceIds: [] }],
    };
    expect(validateAIOutput(output, context.evidenceIds).ok).toBe(false);
  });

  it('rejects any confidence score smuggled into the output (strict schema)', () => {
    const { context } = seedAndContext('inv_1187');
    const ref = evidenceId('invoice', 'INV-1187', 'total');
    const output = { ...validOutput(ref), confidence: 0.97 };
    expect(validateAIOutput(output, context.evidenceIds).ok).toBe(false);
    const outputWithFindingConfidence = {
      ...validOutput(ref),
      findings: [{ job: 'J5', assessment: 'supports', description: 'x', evidenceIds: [ref], confidence: 0.97 }],
    };
    expect(validateAIOutput(outputWithFindingConfidence, context.evidenceIds).ok).toBe(false);
  });
});
