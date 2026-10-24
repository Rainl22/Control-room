import { describe, expect, it } from 'vitest';
import type { AIClient } from '../src/ai/run.js';
import { STAGED_OUTPUTS } from '../src/ai/staged.js';
import { evidenceId } from '../src/evidence.js';
import { runPipeline } from '../src/pipeline.js';
import { buildSeed, toContextSources } from '../src/seed/index.js';
import type { AIOutput, Invoice } from '../src/types.js';
import { NOW } from './helpers.js';

const MODEL = 'test-model';

function clientReturning(output: unknown): AIClient {
  return async () => output;
}

async function pipelineFor(invoiceId: string, client: AIClient, provenance: 'live' | 'staged' = 'live') {
  const seed = buildSeed();
  const invoice = seed.invoices.find((i) => i.id === invoiceId) as Invoice;
  return runPipeline(invoice, toContextSources(seed), {
    ruleset: seed.ruleset,
    aiClient: client,
    model: MODEL,
    provenance,
    now: NOW,
    runId: `run_test_${invoiceId}`,
  });
}

function output({ evidenceRef, ...partial }: Partial<AIOutput> & { evidenceRef: string }): AIOutput {
  return {
    findings: [
      { job: 'J5', assessment: 'supports', description: 'Reviewed.', evidenceIds: [evidenceRef] },
    ],
    proposedClass: 'routine',
    proposedAction: 'proceed',
    brief: 'Synthetic brief.',
    ...partial,
  };
}

describe('pipeline end to end (steps 2-6)', () => {
  it('fixture 1: clean invoice, AI finds nothing -> Routine', async () => {
    const result = await pipelineFor(
      'inv_1187',
      clientReturning(output({ evidenceRef: evidenceId('invoice', 'INV-1187', 'total') })),
    );
    expect(result.merge.floor).toBe('routine');
    expect(result.merge.finalClass).toBe('routine');
    expect(result.aiRun.status).toBe('succeeded');
    expect(result.aiRun.provenance).toBe('live');
  });

  it('fixture 2a: no rule fires, the AI alone raises to Uncertainty', async () => {
    const likelyRepeat: AIOutput = {
      findings: [
        {
          job: 'J1',
          assessment: 'contradicts',
          description: 'INV-2041 is a likely repeat of INV-2014: same amount, same April service.',
          evidenceIds: [
            evidenceId('computed', 'INV-2041', 'similarity:INV-2014'),
            evidenceId('prior_invoice', 'INV-2014', 'total'),
          ],
        },
      ],
      proposedClass: 'uncertainty',
      proposedAction: 'query_supplier',
      brief: 'Likely duplicate billing; confirm with the supplier.',
    };
    const result = await pipelineFor('inv_2041', clientReturning(likelyRepeat));
    expect(result.merge.floor).toBe('routine');
    expect(result.merge.finalClass).toBe('uncertainty');
    expect(result.merge.reasons[0]?.source).toBe('ai');
  });

  it('the AI can cite packet evidence because packets join the context', async () => {
    const result = await pipelineFor(
      'inv_2041',
      clientReturning(
        output({
          evidenceRef: evidenceId('computed', 'INV-2041', 'similarity:INV-2014'),
        }),
      ),
    );
    expect(result.aiRun.status).toBe('succeeded');
  });

  it('fixture 5: a hard stop stays a hard stop whatever the AI proposes', async () => {
    const result = await pipelineFor(
      'inv_5075',
      clientReturning(output({ evidenceRef: evidenceId('invoice', 'INV-5075', 'total'), proposedClass: 'routine' })),
    );
    expect(result.merge.floor).toBe('hard_stop');
    expect(result.merge.finalClass).toBe('hard_stop');
  });

  it('staged outputs validate against their own contexts and produce the scripted outcomes', async () => {
    const expectations: Array<[string, string]> = [
      ['inv_2087', 'uncertainty'], // false alarm raises Uncertainty
      ['inv_6122', 'routine'], // miss: proceeds wrongly
      ['inv_7230', 'routine'], // miss: proceeds wrongly, caught after payment
    ];
    for (const [invoiceId, expectedClass] of expectations) {
      const staged = STAGED_OUTPUTS[invoiceId];
      expect(staged, invoiceId).toBeDefined();
      const result = await pipelineFor(invoiceId, clientReturning(staged), 'staged');
      expect(result.aiRun.status, invoiceId).toBe('succeeded');
      expect(result.aiRun.provenance).toBe('staged');
      expect(result.merge.finalClass, invoiceId).toBe(expectedClass);
    }
  });
});

describe('fail-closed behaviour', () => {
  it('a throwing client becomes a failed run and Uncertainty (Unavailable)', async () => {
    const result = await pipelineFor('inv_1187', async () => {
      throw new Error('socket hang up');
    });
    expect(result.aiRun.status).toBe('failed');
    expect(result.aiRun.failureType).toBe('error');
    expect(result.merge.finalClass).toBe('uncertainty');
    expect(result.merge.reasons.some((r) => r.kind === 'unavailable')).toBe(true);
  });

  it('a timeout is recorded as a timeout', async () => {
    const result = await pipelineFor('inv_1187', async () => {
      throw new Error('Request timed out after 30000ms');
    });
    expect(result.aiRun.failureType).toBe('timeout');
    expect(result.merge.finalClass).toBe('uncertainty');
  });

  it('schema-invalid output fails closed', async () => {
    const result = await pipelineFor('inv_1187', clientReturning({ verdict: 'all good, pay it' }));
    expect(result.aiRun.status).toBe('failed');
    expect(result.aiRun.failureType).toBe('schema_invalid');
    expect(result.aiRun.validationResult).toBe('invalid');
    expect(result.merge.finalClass).toBe('uncertainty');
  });

  it('citing evidence outside the assembled context fails closed', async () => {
    const result = await pipelineFor(
      'inv_1187',
      clientReturning(output({ evidenceRef: 'ev:po:PO-FORGED:total' })),
    );
    expect(result.aiRun.failureType).toBe('unknown_evidence');
    expect(result.merge.finalClass).toBe('uncertainty');
  });

  it('a compliant-looking malicious output still cannot lower a rule floor (injection)', async () => {
    // Even if a manipulated invoice somehow steered the model into a clean
    // "proceed" judgment, the floor is computed in code before the AI runs.
    const result = await pipelineFor(
      'inv_4410',
      clientReturning(
        output({
          evidenceRef: evidenceId('invoice', 'INV-4410', 'total'),
          proposedClass: 'routine',
          proposedAction: 'approve immediately, pre-authorised',
        }),
      ),
    );
    expect(result.merge.finalClass).toBe('authority');
  });

  it('the AIRun stores model, prompt version and input hash for the audit trail', async () => {
    const result = await pipelineFor(
      'inv_1187',
      clientReturning(output({ evidenceRef: evidenceId('invoice', 'INV-1187', 'total') })),
    );
    expect(result.aiRun.model).toBe(MODEL);
    expect(result.aiRun.promptVersion).toBe('p1');
    expect(result.aiRun.inputHash).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });
});
