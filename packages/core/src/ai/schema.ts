import { z } from 'zod';
import { unknownEvidenceIds } from '../evidence.js';
import type { AIFailureType, AIOutput } from '../types.js';

/**
 * The AI output contract, docs/BRIEF.md section 4. Anything that fails
 * validation is treated as an AI failure and falls to Uncertainty (Unavailable).
 * There is no confidence score anywhere in this contract, by design.
 */

export const findingSchema = z
  .object({
    job: z.enum(['J1', 'J2', 'J3', 'J4', 'J5']),
    assessment: z.enum(['supports', 'contradicts', 'unclear']),
    description: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const aiOutputSchema = z
  .object({
    findings: z.array(findingSchema),
    proposedClass: z.enum(['routine', 'authority', 'uncertainty', 'hard_stop']),
    proposedAction: z.string().min(1),
    brief: z.string().min(1),
  })
  .strict();

export type ValidationResult =
  | { ok: true; output: AIOutput }
  | { ok: false; failureType: AIFailureType; detail: string };

/**
 * Validates structure and that every cited evidence ID exists in the assembled
 * context. The AI may cite only what it was given.
 */
export function validateAIOutput(raw: unknown, knownEvidenceIds: Set<string>): ValidationResult {
  const parsed = aiOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, failureType: 'schema_invalid', detail: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const cited = parsed.data.findings.flatMap((f) => f.evidenceIds);
  const unknown = unknownEvidenceIds(cited, knownEvidenceIds);
  if (unknown.length > 0) {
    return { ok: false, failureType: 'unknown_evidence', detail: `cited evidence does not exist: ${unknown.join(', ')}` };
  }
  return { ok: true, output: parsed.data };
}
