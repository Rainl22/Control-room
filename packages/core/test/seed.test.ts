import { describe, expect, it } from 'vitest';
import { usd } from '../src/money';
import { buildSeed } from '../src/seed/index';

describe('seed data matches docs/POLICY.md', () => {
  const seed = buildSeed();

  it('is deterministic: two builds are identical', () => {
    expect(buildSeed()).toEqual(buildSeed());
  });

  it('seeds the roster, accounts and twelve suppliers', () => {
    expect(seed.users.map((u) => u.role).sort()).toEqual(['cfo', 'manager', 'operator']);
    expect(seed.paymentAccounts.map((a) => a.id).sort()).toEqual(['acct_fx', 'acct_ops', 'acct_pay']);
    expect(seed.suppliers).toHaveLength(12);
    expect(seed.suppliers.filter((s) => s.status === 'unverified').map((s) => s.id)).toEqual(['sup_010']);
  });

  it('account balances and minimums match the policy', () => {
    const ops = seed.paymentAccounts.find((a) => a.id === 'acct_ops');
    expect(ops?.balanceCents).toBe(usd(412_600));
    expect(ops?.minimumBalanceCents).toBe(usd(75_000));
    const fx = seed.paymentAccounts.find((a) => a.id === 'acct_fx');
    expect(fx?.balanceCents).toBe(usd(1_250_000));
  });

  it('fixture anchor amounts are exact', () => {
    const amounts: Record<string, number> = {
      'INV-1187': usd(4_320),
      'INV-2041': usd(1_860),
      'INV-2087': usd(1_860),
      'INV-3302': usd(680),
      'INV-4410': usd(18_000),
      'INV-5075': usd(7_950),
      'INV-6122': usd(2_140),
      'INV-7230': usd(3_775),
    };
    for (const [number, cents] of Object.entries(amounts)) {
      const invoice = seed.invoices.find((i) => i.invoiceNumber === number);
      expect(invoice, number).toBeDefined();
      expect(invoice?.totalCents, number).toBe(cents);
      expect(invoice?.currency).toBe('USD');
    }
  });

  it('seeds about 60 invoices, mostly Routine history and filler', () => {
    expect(seed.invoices.length).toBe(60);
  });

  it('every invoice line sums to its total, and money is integer cents', () => {
    for (const invoice of seed.invoices) {
      const lineSum = invoice.lines.reduce((sum, l) => sum + l.amountCents, 0);
      expect(lineSum, invoice.invoiceNumber).toBe(invoice.totalCents);
      expect(Number.isInteger(invoice.totalCents)).toBe(true);
      expect(Number.isInteger(invoice.totalBaseCents)).toBe(true);
      expect(invoice.lines.length).toBeGreaterThan(0);
    }
  });

  it('referential integrity: suppliers, POs and payments resolve', () => {
    const supplierIds = new Set(seed.suppliers.map((s) => s.id));
    const poRefs = new Set(seed.purchaseOrders.map((p) => p.reference));
    const invoiceIds = new Set(seed.invoices.map((i) => i.id));
    for (const invoice of seed.invoices) {
      expect(supplierIds.has(invoice.supplierId), invoice.invoiceNumber).toBe(true);
      if (invoice.poReference) expect(poRefs.has(invoice.poReference), invoice.invoiceNumber).toBe(true);
    }
    for (const payment of seed.payments) {
      expect(invoiceIds.has(payment.invoiceId), payment.id).toBe(true);
    }
  });

  it('invoice numbers are unique except deliberate duplicates (there are none seeded)', () => {
    const numbers = seed.invoices.map((i) => `${i.supplierId}:${i.invoiceNumber}`);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('the demo clock and FX match the policy', () => {
    expect(seed.settings.demoToday).toBe('2025-10-14');
    expect(seed.settings.demoFxRates).toEqual({ USD: 1, GBP: 0.79, EUR: 0.92 });
  });

  it('6a is scheduled for the Thursday run; 6b is already paid', () => {
    const scheduled = seed.payments.find((p) => p.invoiceId === 'inv_6122');
    expect(scheduled?.status).toBe('scheduled');
    expect(scheduled?.scheduledFor).toBe('2025-10-16');
    const paid = seed.payments.find((p) => p.invoiceId === 'inv_7230');
    expect(paid?.status).toBe('paid');
  });

  it('locked rules are R01-R04 and only they are locked', () => {
    const locked = seed.ruleset.rules.filter((r) => r.locked).map((r) => r.id);
    expect(locked).toEqual(['R01', 'R02', 'R03', 'R04']);
  });
});
