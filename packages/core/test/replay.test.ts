import { describe, expect, it } from 'vitest';
import { usd } from '../src/money';
import { replayRuleChange } from '../src/replay';
import { buildSeed, toContextSources } from '../src/seed/index';

const NOW = '2025-10-14T09:00:00Z';

describe('rule-change replay preview (consequence preview)', () => {
  it('raising the R08 threshold shows the invoices that would no longer need approval', () => {
    const seed = buildSeed();
    const preview = replayRuleChange(toContextSources(seed), seed.ruleset, 'R08', { thresholdCents: usd(20_000) }, NOW);
    // INV-4410 ($18,000) currently fires R08 and would stop.
    expect(preview.noLongerFiring.map((c) => c.invoiceNumber)).toContain('INV-4410');
    expect(preview.newlyFiring).toEqual([]);
  });

  it('lowering the R08 threshold shows newly-firing invoices', () => {
    const seed = buildSeed();
    const preview = replayRuleChange(toContextSources(seed), seed.ruleset, 'R08', { thresholdCents: usd(3_000) }, NOW);
    expect(preview.newlyFiring.length).toBeGreaterThan(0);
    expect(preview.newlyFiring.every((c) => c.totalBaseCents > usd(3_000))).toBe(true);
    expect(preview.noLongerFiring).toEqual([]);
  });

  it('widening the R05 tolerance stops fixture 3 from firing', () => {
    const seed = buildSeed();
    const preview = replayRuleChange(
      toContextSources(seed),
      seed.ruleset,
      'R05',
      { tolerancePct: 10, toleranceAbsCents: usd(25) },
      NOW,
    );
    expect(preview.noLongerFiring.map((c) => c.invoiceNumber)).toContain('INV-3302');
  });

  it('is a pure what-if: the ruleset passed in is not mutated', () => {
    const seed = buildSeed();
    const before = JSON.stringify(seed.ruleset);
    replayRuleChange(toContextSources(seed), seed.ruleset, 'R08', { thresholdCents: usd(1) }, NOW);
    expect(JSON.stringify(seed.ruleset)).toBe(before);
  });
});
