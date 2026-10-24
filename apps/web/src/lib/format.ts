import { toDisplayCents, type CurrencyCode, type Settings } from '@control-room/core';

const SYMBOLS: Record<CurrencyCode, string> = { USD: '$', GBP: '£', EUR: '€' };

export function formatCents(cents: number, currency: CurrencyCode): string {
  const major = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${SYMBOLS[currency]}${major}`;
}

/** Display-currency formatting. Visual only; rules always evaluate in USD. */
export function formatBase(baseCents: number, display: CurrencyCode, settings: Settings): string {
  return formatCents(toDisplayCents(baseCents, display, settings), display);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function daysUntil(iso: string, today: string): number {
  const ms = new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}
