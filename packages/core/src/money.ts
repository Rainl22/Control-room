import type { CurrencyCode, Settings } from './types';

/** Dollars (or pounds/euros) to integer cents. Fails on non-integer results. */
export function cents(majorUnits: number): number {
  const c = Math.round(majorUnits * 100);
  if (!Number.isFinite(c)) throw new Error(`invalid amount: ${majorUnits}`);
  return c;
}

export const usd = cents;

/**
 * Convert an amount in `currency` to base-currency (USD) cents at ingestion,
 * using the fixed demo FX rate (units of foreign currency per 1 USD).
 * Returns the base amount and the rate used.
 */
export function toBaseCents(
  amountCents: number,
  currency: CurrencyCode,
  settings: Settings,
): { baseCents: number; fxRate: number } {
  if (!Number.isInteger(amountCents)) throw new Error('money must be integer cents');
  if (currency === settings.baseCurrency) return { baseCents: amountCents, fxRate: 1 };
  const rate = settings.demoFxRates[currency];
  if (!rate || rate <= 0) throw new Error(`no demo FX rate for ${currency}`);
  return { baseCents: Math.round(amountCents / rate), fxRate: rate };
}

/** Display-only conversion from base cents to the display currency. Never used by rules. */
export function toDisplayCents(baseCents: number, display: CurrencyCode, settings: Settings): number {
  if (display === settings.baseCurrency) return baseCents;
  const rate = settings.demoFxRates[display];
  if (!rate || rate <= 0) throw new Error(`no demo FX rate for ${display}`);
  return Math.round(baseCents * rate);
}
