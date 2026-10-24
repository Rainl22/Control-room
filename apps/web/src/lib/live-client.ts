import type { AIClient } from '@control-room/core';

/**
 * The browser-side half of live mode: posts the assembled payload to the
 * server route holding the API key. Any failure throws, and the core's
 * fail-closed behaviour turns it into Uncertainty (Unavailable).
 */

export async function liveAvailability(): Promise<{ live: boolean; model: string }> {
  try {
    const response = await fetch('/api/ai-judgment', { method: 'GET' });
    if (!response.ok) return { live: false, model: 'none' };
    const data = (await response.json()) as { live?: boolean; model?: string };
    return { live: data.live === true, model: data.model ?? 'unknown' };
  } catch {
    return { live: false, model: 'none' };
  }
}

export const liveClient: AIClient = async ({ userPayload }) => {
  const response = await fetch('/api/ai-judgment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userPayload }),
  });
  if (response.status === 429) throw new Error('Live limit reached');
  if (!response.ok) throw new Error(`Live call failed (${response.status})`);
  const data = (await response.json()) as { raw: unknown };
  return data.raw;
};
