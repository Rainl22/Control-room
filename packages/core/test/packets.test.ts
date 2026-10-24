import { describe, expect, it } from 'vitest';
import { usd } from '../src/money.js';
import { buildPackets, DEFAULT_PACKET_PARAMS, similarity } from '../src/packets.js';
import { seedAndContext, NOW } from './helpers.js';

describe('J1 near-duplicate scoring (computed in code, never by the AI)', () => {
  it('fixture 2a: INV-2041 scores INV-2014 as a candidate at or above 0.75', () => {
    const { invoice, context } = seedAndContext('inv_2041');
    const { packets } = buildPackets(invoice, context, NOW);
    const candidate = packets.nearDuplicates.find((c) => c.priorInvoiceNumber === 'INV-2014');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('fixture 2b: INV-2087 has a candidate, so the staged false alarm has inputs', () => {
    const { invoice, context } = seedAndContext('inv_2087');
    const { packets } = buildPackets(invoice, context, NOW);
    expect(packets.nearDuplicates.length).toBeGreaterThan(0);
  });

  it('fixtures 6a and 6b: the true duplicates are strong candidates', () => {
    for (const [invoiceId, priorNumber] of [
      ['inv_6122', 'INV-6119'],
      ['inv_7230', 'INV-7198'],
    ] as const) {
      const { invoice, context } = seedAndContext(invoiceId);
      const { packets } = buildPackets(invoice, context, NOW);
      const candidate = packets.nearDuplicates.find((c) => c.priorInvoiceNumber === priorNumber);
      expect(candidate, `${invoiceId} -> ${priorNumber}`).toBeDefined();
      expect(candidate!.score).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('fixture 1: the clean routine invoice has no candidates', () => {
    const { invoice, context } = seedAndContext('inv_1187');
    const { packets } = buildPackets(invoice, context, NOW);
    expect(packets.nearDuplicates).toEqual([]);
  });

  it('every candidate carries its components and computed evidence', () => {
    const { invoice, context } = seedAndContext('inv_6122');
    const { packets, evidence } = buildPackets(invoice, context, NOW);
    for (const candidate of packets.nearDuplicates) {
      expect(candidate.components.amount).toBeGreaterThanOrEqual(0);
      expect(candidate.evidenceIds.some((id) => id.startsWith('ev:computed:'))).toBe(true);
    }
    expect(evidence.some((e) => e.type === 'computed_stat')).toBe(true);
  });

  it('the threshold is a tunable parameter', () => {
    const { invoice, context } = seedAndContext('inv_6122');
    const strict = buildPackets(invoice, context, NOW, { ...DEFAULT_PACKET_PARAMS, nearDuplicateThreshold: 0.99 });
    expect(strict.packets.nearDuplicates).toEqual([]);
  });

  it('is deterministic', () => {
    const a = seedAndContext('inv_2041');
    const b = seedAndContext('inv_2041');
    expect(buildPackets(a.invoice, a.context, NOW).packets).toEqual(buildPackets(b.invoice, b.context, NOW).packets);
  });
});

describe('J2 line differences against the PO', () => {
  it('fixture 3: the $60 freight line is an extra and the total diff is $60', () => {
    const { invoice, context } = seedAndContext('inv_3302');
    const { packets } = buildPackets(invoice, context, NOW);
    expect(packets.lineDiff).toBeDefined();
    expect(packets.lineDiff!.poReference).toBe('PO-5598');
    expect(packets.lineDiff!.totalDiffCents).toBe(usd(60));
    expect(packets.lineDiff!.extras).toHaveLength(1);
    expect(packets.lineDiff!.extras[0]!.amountCents).toBe(usd(60));
    expect(packets.lineDiff!.matched).toHaveLength(1);
    expect(packets.lineDiff!.matched[0]!.amountDiffCents).toBe(0);
  });

  it('fixture 1: an exact match has no extras and zero diff', () => {
    const { invoice, context } = seedAndContext('inv_1187');
    const { packets } = buildPackets(invoice, context, NOW);
    expect(packets.lineDiff!.totalDiffCents).toBe(0);
    expect(packets.lineDiff!.extras).toEqual([]);
  });
});

describe('similarity components', () => {
  it('identical invoices score 1.0 on every component', () => {
    const { invoice } = seedAndContext('inv_1187');
    const s = similarity(invoice, invoice, DEFAULT_PACKET_PARAMS);
    expect(s.amount).toBe(1);
    expect(s.invoiceNumber).toBe(1);
    expect(s.lineOverlap).toBe(1);
    expect(s.score).toBeGreaterThan(0.95);
  });
});
