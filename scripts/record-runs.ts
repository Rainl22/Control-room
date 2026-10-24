/**
 * Captures genuine model runs for the five genuine fixtures (1, 2a, 3, 4, 5)
 * and writes them to apps/web/src/lib/recorded-runs.json. These become the
 * "Recorded run" fallback (brief section 4): stored outputs from real earlier
 * model runs, shown with their date and model — never authored.
 *
 * Usage: ANTHROPIC_API_KEY=... npm run record
 * The staged failures (2b, 6a, 6b) are deliberately NOT recorded: they stay
 * pinned authored examples, as the brief requires.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  assembleContext,
  buildPackets,
  buildUserPayload,
  evaluate,
  hashInput,
  toContextSources,
  buildSeed,
  validateAIOutput,
  SYSTEM_PROMPT,
  PROMPT_VERSION,
} from '../packages/core/src/index';

const GENUINE_FIXTURES = ['inv_1187', 'inv_2041', 'inv_3302', 'inv_4410', 'inv_5075'];
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';
const API_KEY = process.env.ANTHROPIC_API_KEY;

interface RecordedRun {
  invoiceId: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  recordedAt: string;
  output: unknown;
}

async function callModel(userPayload: string): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${userPayload}\n\nReturn ONLY the JSON object matching required_output_schema. No markdown fences, no commentary.`,
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  return JSON.parse(stripped);
}

async function main() {
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Add it to the environment and re-run.');
    process.exit(1);
  }
  const seed = buildSeed();
  const sources = toContextSources(seed);
  const now = `${seed.settings.demoToday}T09:00:00Z`;
  const runs: Record<string, RecordedRun> = {};

  for (const invoiceId of GENUINE_FIXTURES) {
    const invoice = seed.invoices.find((i) => i.id === invoiceId)!;
    const context = assembleContext(invoice, sources, now);
    const ruleResults = evaluate(invoice, context, seed.ruleset);
    const { packets, evidence } = buildPackets(invoice, context, now);
    context.evidence.push(...evidence);
    for (const e of evidence) context.evidenceIds.add(e.id);

    const userPayload = buildUserPayload({ context, ruleResults, packets });
    process.stdout.write(`Recording ${invoice.invoiceNumber} (${MODEL})... `);
    const raw = await callModel(userPayload);
    const validated = validateAIOutput(raw, context.evidenceIds);
    if (!validated.ok) {
      console.error(`INVALID (${validated.failureType}): ${validated.detail}`);
      console.error('The run is not recorded. Inspect the output:\n', JSON.stringify(raw, null, 2).slice(0, 2000));
      process.exitCode = 1;
      continue;
    }
    runs[invoiceId] = {
      invoiceId,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      inputHash: hashInput(userPayload),
      recordedAt: new Date().toISOString(),
      output: validated.output,
    };
    console.log(`ok (proposed ${validated.output.proposedClass}, ${validated.output.findings.length} findings)`);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(here, '../apps/web/src/lib/recorded-runs.json');
  writeFileSync(outPath, `${JSON.stringify({ runs }, null, 2)}\n`);
  console.log(`\nWrote ${Object.keys(runs).length} recorded runs to ${outPath}`);
}

void main();
