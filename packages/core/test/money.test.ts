import { describe, expect, it } from 'vitest';
import { cents, toBaseCents, toDisplayCents, usd } from '../src/money.js';
import { SETTINGS } from '../src/seed/company.js';

describe('money: integer cents plus ISO currency', () => {
  it('converts major units to integer cents', () => {
    expect(usd(4_320)).toBe(432000);
    expect(cents(0.1)).toBe(10);
    expect(cents(680.55)).toBe(68055);
  });

  it('converts a GBP amount to base USD cents at the fixed demo rate', () => {
    // £790.00 at 0.79 GBP per USD -> $1,000.00
    expect(toBaseCents(usd(790), 'GBP', SETTINGS)).toEqual({ baseCents: usd(1_000), fxRate: 0.79 });
    // USD passes through untouched
    expect(toBaseCents(usd(42), 'USD', SETTINGS)).toEqual({ baseCents: usd(42), fxRate: 1 });
  });

  it('rejects non-integer cents', () => {
    expect(() => toBaseCents(10.5, 'GBP', SETTINGS)).toThrow();
  });

  it('display conversion is visual only and never feeds rules', () => {
    expect(toDisplayCents(usd(100), 'GBP', SETTINGS)).toBe(usd(79));
    expect(toDisplayCents(usd(100), 'EUR', SETTINGS)).toBe(usd(92));
    expect(toDisplayCents(usd(100), 'USD', SETTINGS)).toBe(usd(100));
  });
});
