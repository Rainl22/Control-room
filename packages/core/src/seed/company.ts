import { usd } from '../money.js';
import type { BankAccount, PaymentAccount, Settings, Supplier, User } from '../types.js';

/**
 * Harbourline Supply Co. — the fictional company from docs/POLICY.md.
 * Everything here is invented; bank details are synthetic strings.
 */

export const SETTINGS: Settings = {
  baseCurrency: 'USD',
  displayCurrency: 'USD',
  demoToday: '2025-10-14', // Tuesday. Payment runs happen on Thursdays.
  demoFxRates: { USD: 1, GBP: 0.79, EUR: 0.92 },
  fxAsOf: '2025-10-14',
};

export const USERS: User[] = [
  { id: 'usr_dana', name: 'Dana Okafor', role: 'operator' },
  { id: 'usr_marcus', name: 'Marcus Reyes', role: 'manager' },
  { id: 'usr_elena', name: 'Elena Voss', role: 'cfo' },
];

export const PAYMENT_ACCOUNTS: PaymentAccount[] = [
  {
    id: 'acct_ops',
    name: 'Operating account, Northgate Bank',
    type: 'operating',
    last4: '4821',
    currency: 'USD',
    balanceCents: usd(412_600),
    minimumBalanceCents: usd(75_000),
  },
  {
    id: 'acct_pay',
    name: 'Payables account, Northgate Bank',
    type: 'operating',
    last4: '7730',
    currency: 'USD',
    balanceCents: usd(96_300),
    minimumBalanceCents: usd(20_000),
  },
  {
    id: 'acct_fx',
    name: 'Reserve account, Cobalt Credit Union',
    type: 'reserve',
    last4: '1156',
    currency: 'USD',
    balanceCents: usd(1_250_000),
    minimumBalanceCents: usd(250_000),
  },
];

interface SupplierSpec {
  id: string;
  name: string;
  category: string;
  termsDays: number;
  funding: string;
  status?: 'unverified' | 'verified';
  country?: string;
  currency?: 'USD' | 'GBP';
  accountCountry?: string;
}

const SUPPLIER_SPECS: SupplierSpec[] = [
  { id: 'sup_001', name: 'Alder & Finch Packaging', category: 'Packaging', termsDays: 30, funding: 'acct_ops' },
  { id: 'sup_002', name: 'Brightwater Cleaning Services', category: 'Facilities', termsDays: 15, funding: 'acct_pay' },
  { id: 'sup_003', name: 'Copperline Freight', category: 'Logistics', termsDays: 30, funding: 'acct_ops' },
  { id: 'sup_004', name: 'Delmar Industrial Equipment', category: 'Capital goods', termsDays: 45, funding: 'acct_fx' },
  { id: 'sup_005', name: 'Evergreen Pallet Co.', category: 'Packaging', termsDays: 30, funding: 'acct_ops' },
  { id: 'sup_006', name: 'Fairhaven Office Supply', category: 'Office', termsDays: 30, funding: 'acct_ops' },
  { id: 'sup_007', name: 'Granite State Utilities', category: 'Utilities', termsDays: 20, funding: 'acct_pay' },
  { id: 'sup_008', name: 'Harlow IT Services', category: 'Technology', termsDays: 30, funding: 'acct_ops' },
  { id: 'sup_009', name: 'Ironbridge Safety Gear', category: 'Safety', termsDays: 30, funding: 'acct_ops' },
  { id: 'sup_010', name: 'Juniper Print Works', category: 'Print', termsDays: 30, funding: 'acct_ops', status: 'unverified' },
  { id: 'sup_011', name: 'Kestrel Components Ltd', category: 'Components', termsDays: 30, funding: 'acct_fx', country: 'GB', currency: 'GBP', accountCountry: 'GB' },
  { id: 'sup_012', name: 'Lumen Facility Lighting', category: 'Facilities', termsDays: 30, funding: 'acct_pay' },
];

function contactFor(name: string, id: string): { name: string; phone: string; email: string } {
  const n = Number(id.slice(-3));
  const domain = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 12);
  return {
    name: `AP desk, ${name}`,
    phone: `+1 555 01${String(n).padStart(2, '0')}`,
    email: `accounts@${domain}.example`,
  };
}

export const SUPPLIERS: Supplier[] = SUPPLIER_SPECS.map((s) => ({
  id: s.id,
  name: s.name,
  country: s.country ?? 'US',
  status: s.status ?? 'verified',
  defaultCurrency: s.currency ?? 'USD',
  category: s.category,
  paymentTermsDays: s.termsDays,
  fundingAccountId: s.funding,
  verifiedContact: contactFor(s.name, s.id),
  facts: [],
}));

/** One verified bank account per verified supplier. Account numbers are synthetic. */
export const BANK_ACCOUNTS: BankAccount[] = SUPPLIER_SPECS.filter((s) => s.status !== 'unverified').map(
  (s) => ({
    id: `ba_${s.id.slice(4)}`,
    supplierId: s.id,
    holder: s.name,
    accountNumber: `SYN-${s.id.slice(4)}-${s.accountCountry ?? 'US'}-9${s.id.slice(-2)}04`,
    country: s.accountCountry ?? 'US',
    status: 'verified',
    verifiedBy: 'usr_marcus',
    verifiedAt: '2025-03-01T10:00:00Z',
  }),
);

export function verifiedAccountFor(supplierId: string): BankAccount {
  const account = BANK_ACCOUNTS.find((a) => a.supplierId === supplierId);
  if (!account) throw new Error(`no verified account for ${supplierId}`);
  return account;
}
