import type { ContextSources } from '../context';
import { starterRuleset } from '../rules/catalogue';
import type {
  BankAccount,
  Invoice,
  Payment,
  PaymentAccount,
  PurchaseOrder,
  Ruleset,
  Settings,
  Supplier,
  User,
} from '../types';
import { BANK_ACCOUNTS, PAYMENT_ACCOUNTS, SETTINGS, SUPPLIERS, USERS } from './company';
import { buildFiller } from './filler';
import {
  FIXTURE_EXPECTATIONS,
  FIXTURE_INVOICES,
  FIXTURE_PAYMENTS,
  FIXTURE_POS,
  PRIOR_INVOICES,
} from './fixtures';

export interface SeedData {
  settings: Settings;
  users: User[];
  paymentAccounts: PaymentAccount[];
  suppliers: Supplier[];
  bankAccounts: BankAccount[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  payments: Payment[];
  ruleset: Ruleset;
}

/** Seed records are plain JSON data, so a JSON round-trip is a safe deep clone. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deterministic synthetic company state, matching docs/POLICY.md exactly:
 * eight fixture anchors, their prior invoices, and ~49 Routine filler invoices
 * (about 60 in total). Calling it twice yields identical data.
 */
export function buildSeed(): SeedData {
  const filler = buildFiller();
  return {
    settings: { ...SETTINGS },
    users: clone(USERS),
    paymentAccounts: clone(PAYMENT_ACCOUNTS),
    suppliers: clone(SUPPLIERS),
    bankAccounts: clone(BANK_ACCOUNTS),
    purchaseOrders: clone([...FIXTURE_POS, ...filler.purchaseOrders]),
    invoices: clone([...FIXTURE_INVOICES, ...PRIOR_INVOICES, ...filler.invoices]),
    payments: clone([...FIXTURE_PAYMENTS, ...filler.payments]),
    ruleset: starterRuleset(),
  };
}

export function toContextSources(seed: SeedData): ContextSources {
  return {
    suppliers: seed.suppliers,
    bankAccounts: seed.bankAccounts,
    purchaseOrders: seed.purchaseOrders,
    invoices: seed.invoices,
    payments: seed.payments,
    rulesetVersion: seed.ruleset.version,
  };
}

export { FIXTURE_EXPECTATIONS } from './fixtures';
export type { FixtureExpectation } from './fixtures';
export { addDays, thursdayOnOrBefore } from './filler';
