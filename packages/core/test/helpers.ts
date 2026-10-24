import { assembleContext } from '../src/context';
import { toBaseCents, usd } from '../src/money';
import type { SeedData } from '../src/seed/index';
import { buildSeed, toContextSources } from '../src/seed/index';
import type { CurrencyCode, Invoice, InvoiceContext } from '../src/types';

export const NOW = '2025-10-14T09:00:00Z';

export function seedAndContext(invoiceId: string): { seed: SeedData; invoice: Invoice; context: InvoiceContext } {
  const seed = buildSeed();
  const invoice = seed.invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error(`no seeded invoice ${invoiceId}`);
  return { seed, invoice, context: assembleContext(invoice, toContextSources(seed), NOW) };
}

/** A synthetic invoice for rule unit tests, appended to the seed before assembly. */
export function syntheticInvoice(
  seed: SeedData,
  overrides: Partial<Invoice> & { supplierId: string },
): { invoice: Invoice; context: InvoiceContext } {
  const supplier = seed.suppliers.find((s) => s.id === overrides.supplierId);
  if (!supplier) throw new Error(`unknown supplier ${overrides.supplierId}`);
  const account = seed.bankAccounts.find((a) => a.supplierId === supplier.id && a.status === 'verified');
  const currency: CurrencyCode = overrides.currency ?? 'USD';
  const totalCents = overrides.totalCents ?? usd(1_000);
  const { baseCents, fxRate } = toBaseCents(totalCents, currency, seed.settings);

  const invoice: Invoice = {
    id: 'inv_test',
    invoiceNumber: 'INV-TEST-1',
    issueDate: '2025-10-10',
    dueDate: '2025-11-09',
    currency,
    totalCents,
    totalBaseCents: baseCents,
    fxRate,
    fxAsOf: seed.settings.fxAsOf,
    lines: [
      { id: 'inv_test-l1', description: 'Test goods', quantity: 1, unitPriceCents: totalCents, amountCents: totalCents },
    ],
    bankDetailsOnInvoice: account
      ? { holder: account.holder, accountNumber: account.accountNumber, country: account.country }
      : { holder: supplier.name, accountNumber: 'SYN-UNKNOWN-0001', country: 'US' },
    extractorConfidence: 96,
    state: 'received',
    sourceRef: 'extractor:INV-TEST-1',
    ...overrides,
  };

  seed.invoices.push(invoice);
  const context = assembleContext(invoice, toContextSources(seed), NOW);
  return { invoice, context };
}

export function firedRuleIds(results: Array<{ ruleId: string; fired: boolean }>): string[] {
  return results.filter((r) => r.fired).map((r) => r.ruleId);
}
