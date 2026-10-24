import { SYSTEM_PROMPT } from '@control-room/core';
import { NextRequest, NextResponse } from 'next/server';

/**
 * The only server-side piece of the demo: one structured model call per
 * request. The API key never reaches the browser. Demo-mode decision
 * (brief section 14): live by default with a rate limit and a spend cap;
 * the client falls back to recorded runs, then fails closed.
 *
 * The payload is invoice data assembled by the pipeline, never free text
 * typed by the public, and the response is only ever treated as an
 * untrusted candidate output: the core validates structure and evidence
 * citations before anything uses it.
 */

export const dynamic = 'force-dynamic';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';
const MAX_PAYLOAD_BYTES = 200_000;
const MAX_TOKENS = 1500;

// Best-effort limits (per serverless instance). The hard spend cap is the
// budget limit set on the API key itself in the Anthropic console.
const PER_IP_PER_HOUR = 30;
const GLOBAL_PER_DAY = 500;
const ipHits = new Map<string, { count: number; windowStart: number }>();
let globalCount = 0;
let globalWindowStart = Date.now();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (now - globalWindowStart > 86_400_000) {
    globalCount = 0;
    globalWindowStart = now;
  }
  if (++globalCount > GLOBAL_PER_DAY) return true;
  const entry = ipHits.get(ip);
  if (!entry || now - entry.windowStart > 3_600_000) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > PER_IP_PER_HOUR;
}

export function GET() {
  return NextResponse.json({ live: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'live_unavailable' }, { status: 503 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: { userPayload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const userPayload = body.userPayload;
  if (typeof userPayload !== 'string' || userPayload.length === 0 || userPayload.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Low effort keeps the call inside serverless time limits; the
      // judgment task is interpretive, not deep reasoning. No sampling
      // params: current models reject them.
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${userPayload}\n\nReturn ONLY the JSON object matching required_output_schema. No markdown fences, no commentary.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const status = response.status === 429 ? 429 : 502;
    return NextResponse.json({ error: 'upstream_error', status: response.status }, { status });
  }

  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }>; model?: string };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    // Parse failures are still "the model answered": the core treats
    // non-conforming output as schema_invalid and fails closed.
    raw = { unparseable: text.slice(0, 2000) };
  }
  return NextResponse.json({ raw, model: data.model ?? MODEL });
}
