import { runAIJudgment, type AIClient } from './ai/run.js';
import { assembleContext, type ContextSources } from './context.js';
import { merge, type AIRunOutcome, type MergeResult } from './merge.js';
import { buildPackets, DEFAULT_PACKET_PARAMS, type AnalysisPackets, type PacketParams } from './packets.js';
import { evaluate } from './rules/engine.js';
import type { AIProvenance, AIRun, Invoice, InvoiceContext, RuleResult, Ruleset } from './types.js';

/**
 * Steps 2-6 of the decision flow: context assembly, rule evaluation, analysis
 * packets, AI judgment, merge. Routing (step 7) and state transitions (step 9)
 * live with the store and state machine; this function has no side effects
 * beyond the returned records.
 */

export interface PipelineOptions {
  ruleset: Ruleset;
  aiClient: AIClient;
  model: string;
  provenance: AIProvenance;
  now: string;
  runId: string;
  packetParams?: PacketParams;
}

export interface PipelineResult {
  context: InvoiceContext;
  ruleResults: RuleResult[];
  packets: AnalysisPackets;
  aiRun: AIRun;
  merge: MergeResult;
}

export async function runPipeline(
  invoice: Invoice,
  db: ContextSources,
  options: PipelineOptions,
): Promise<PipelineResult> {
  // Step 2: context assembly
  const context = assembleContext(invoice, db, options.now);

  // Step 3: rule evaluation
  const ruleResults = evaluate(invoice, context, options.ruleset);

  // Step 4: analysis packets; their computed stats join the citable context
  const { packets, evidence } = buildPackets(invoice, context, options.now, options.packetParams ?? DEFAULT_PACKET_PARAMS);
  context.evidence.push(...evidence);
  for (const e of evidence) context.evidenceIds.add(e.id);

  // Step 5: one structured AI call
  const aiRun = await runAIJudgment({
    context,
    ruleResults,
    packets,
    client: options.aiClient,
    model: options.model,
    provenance: options.provenance,
    now: options.now,
    runId: options.runId,
  });

  // Step 6: merge. The AI can only raise the rule floor; failure falls closed.
  const outcome: AIRunOutcome =
    aiRun.status === 'succeeded' && aiRun.output
      ? { status: 'succeeded', output: aiRun.output }
      : { status: 'failed', failureType: aiRun.failureType ?? 'error' };
  const mergeResult = merge(invoice, ruleResults, outcome, options.ruleset);

  return { context, ruleResults, packets, aiRun, merge: mergeResult };
}
