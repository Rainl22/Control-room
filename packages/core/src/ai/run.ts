import type { AnalysisPackets } from '../packets.js';
import type { AIProvenance, AIRun, InvoiceContext, RuleResult } from '../types.js';
import { buildUserPayload, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt.js';
import { validateAIOutput } from './schema.js';

/**
 * Step 5 of the pipeline. The network client is injected so this module stays
 * pure and testable; the core never imports an SDK. Whatever goes wrong — the
 * call throws, times out, returns invalid structure or cites unknown evidence —
 * the run is recorded as failed and the merge fails closed to Uncertainty
 * (Unavailable). It never defaults to Routine.
 */

/** Performs the model call and returns the raw (unvalidated) output. */
export type AIClient = (args: {
  system: string;
  userPayload: string;
  model: string;
}) => Promise<unknown>;

export interface RunArgs {
  context: InvoiceContext;
  ruleResults: RuleResult[];
  packets: AnalysisPackets;
  client: AIClient;
  model: string;
  provenance: AIProvenance;
  now: string;
  runId: string;
}

/** Stable content hash so an AIRun can be matched to its exact inputs. */
export function hashInput(payload: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export async function runAIJudgment(args: RunArgs): Promise<AIRun> {
  const { context, ruleResults, packets, client, model, provenance, now, runId } = args;
  const userPayload = buildUserPayload({ context, ruleResults, packets });
  const base: Omit<AIRun, 'status' | 'validationResult'> = {
    id: runId,
    invoiceId: context.invoice.id,
    model,
    promptVersion: PROMPT_VERSION,
    inputHash: hashInput(userPayload),
    provenance,
    createdAt: now,
  };

  let raw: unknown;
  try {
    raw = await client({ system: SYSTEM_PROMPT, userPayload, model });
  } catch (error) {
    const timeout = error instanceof Error && /timeout|timed out/i.test(error.message);
    return { ...base, status: 'failed', failureType: timeout ? 'timeout' : 'error', validationResult: 'not_applicable' };
  }

  const validated = validateAIOutput(raw, context.evidenceIds);
  if (!validated.ok) {
    return { ...base, status: 'failed', failureType: validated.failureType, validationResult: 'invalid' };
  }
  return { ...base, status: 'succeeded', output: validated.output, validationResult: 'valid' };
}
