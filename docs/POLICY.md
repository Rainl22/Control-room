# Fictional company: policy and roster

Everything here is invented. This file is the single source for the synthetic company. Seed data, rule parameters and fixtures must agree with it. If a number changes here, change it in the seed scripts and in `docs/BRIEF.md` section 10 too.

## The company

**Harbourline Supply Co.** is a 140-person regional distributor of packaging and facilities supplies, based in the US. It pays about 300 supplier invoices a month. Finance is a team of three: one operator, one manager, one CFO. That is the reason the segregation rules are few (brief section 8).

Base currency is USD. The demo "today" is fixed at **Tuesday 14 October 2025** so due dates, overdue bands and weekly payment runs stay stable. Payment runs happen on Thursdays.

## Roster

| Name | Role | Notes |
|---|---|---|
| Dana Okafor | Operator | Accounts payable clerk. Default user on load. Resolves Uncertainty up to $10,000. |
| Marcus Reyes | Manager | Finance manager. Approves up to $50,000. Performs verification step 2. |
| Elena Voss | CFO | Approves any amount. Only person who can edit R08 and R11. |

Only one Operator and one Manager are seeded, which shapes verification. Step 1 can be done by Dana or Marcus, but step 2 only by Marcus, and the same person cannot do both. So in the bank-change fixture Dana does step 1 and Marcus does step 2. If Marcus does step 1, nobody can complete step 2 and the case waits. The CFO cannot do either step. That is a deliberate policy choice (brief section 8), and the prototype should show it rather than hide it.

## Approval and control policy (summary)

These lines map one-to-one to the rule catalogue. The rules screen always shows them in USD.

1. **Trust.** A bank-detail change (R01) or an unverified supplier (R02) stops the invoice until the supplier is contacted using the details already on the supplier record, and a second, different Manager confirms. Invoice-supplied contact details are never used.
2. **Conflicts.** An exact duplicate (R03) or a closed or exhausted PO (R04) needs a person to resolve it. These are locked: changing them needs a Manager and the CFO, and the requester cannot co-approve.
3. **Tolerance.** An invoice may exceed its PO by 2% or $25, whichever is greater (R05). Beyond that a person looks.
4. **PO required** above $500 (R06).
5. **Extraction quality.** Extractor confidence below 85%, or a missing required field, needs a person (R07).
6. **Approval threshold.** Any invoice above $10,000 needs a signature (R08). Managers sign up to $50,000, the CFO signs anything above (R11).
7. **Currency and payee.** Only USD is allowed without approval (R09). A payee bank account outside the US needs Manager approval at any amount (R10).
8. **Funding.** Each account keeps a minimum balance (R12, documented only).

Everything not caught by a rule or by the AI is Routine and proceeds without a person.

## Payment accounts (read-only, synthetic)

| ID | Account | Use | Balance | Minimum (R12) |
|---|---|---|---|---|
| acct_ops | Operating account, Northgate Bank, ending 4821 | Default for most suppliers | $412,600.00 | $75,000.00 |
| acct_pay | Payables account, Northgate Bank, ending 7730 | Utilities and recurring services | $96,300.00 | $20,000.00 |
| acct_fx | Reserve account, Cobalt Credit Union, ending 1156 | Large or exceptional payments | $1,250,000.00 | $250,000.00 |

Balances are fictional and static except where scheduled payments reduce the "balance after payments" figure shown in the review consequence line. Account endings are not real numbers.

## Display currency

Display only. Fixed demo rate, shown with its date on the settings screen: **1 USD = 0.79 GBP = 0.92 EUR, as of 14 October 2025.** Rules and thresholds never change.

## Supplier universe

Twelve suppliers. All verified unless noted. Bank details are synthetic strings.

| ID | Supplier | Category | Terms | Funding | Notes |
|---|---|---|---|---|---|
| sup_001 | Alder & Finch Packaging | Packaging | Net 30 | acct_ops | Scenario 1 (routine). Long clean history. |
| sup_002 | Brightwater Cleaning Services | Facilities | Net 15 | acct_pay | Scenarios 2a and 2b. Bills a similar monthly amount. |
| sup_003 | Copperline Freight | Logistics | Net 30 | acct_ops | Scenario 3. Adds freight lines to POs. |
| sup_004 | Delmar Industrial Equipment | Capital goods | Net 45 | acct_fx | Scenario 4. Large invoices. |
| sup_005 | Evergreen Pallet Co. | Packaging | Net 30 | acct_ops | Scenario 5 (bank details change). |
| sup_006 | Fairhaven Office Supply | Office | Net 30 | acct_ops | Scenario 6a (true duplicate, missed by AI). |
| sup_007 | Granite State Utilities | Utilities | Net 20 | acct_pay | Scenario 6b (true duplicate, missed, caught after payment). |
| sup_008 | Harlow IT Services | Technology | Net 30 | acct_ops | Filler with clean history. |
| sup_009 | Ironbridge Safety Gear | Safety | Net 30 | acct_ops | Filler. Supplier-scope tolerance example. |
| sup_010 | Juniper Print Works | Print | Net 30 | acct_ops | Unverified supplier. R02 fixture (documented, near-free to add). |
| sup_011 | Kestrel Components Ltd | Components | Net 30 | acct_fx | Invoices in GBP, payee account in the UK. R09 and R10 fixture (documented). |
| sup_012 | Lumen Facility Lighting | Facilities | Net 30 | acct_pay | Filler. Missing-PO stretch fixture (R06, J3). |

## Fixture anchors

These facts must hold in the seed data so the brief's scenarios work exactly as written. IDs and amounts are fixed. Dates are relative to the demo "today".

| Fixture | Supplier | Invoice | Key facts |
|---|---|---|---|
| 1 | sup_001 | INV-1187 | $4,320.00. Matches PO-5521 to the cent. Due in 12 days. No rule fires, AI finds nothing. |
| 2a | sup_002 | INV-2041 | $1,860.00, April service. Earlier INV-2014 for the same service, same amount, was already paid. Different invoice number, so R03 does not fire. J1 judges a likely repeat. |
| 2b | sup_002 | INV-2087 | $1,860.00, legitimate monthly invoice for a different month. Staged: J1 wrongly flags it as a repeat. Dismissing records a "false alarm" verdict. |
| 3 | sup_003 | INV-3302 | $680.00 against PO-5598 at $620.00. $60 is 9.7% over, beyond ±2% or $25, so R05 fires. Invoice has a $60.00 freight line. J2 proposes accepting it. |
| 4 | sup_004 | INV-4410 | $18,000.00 against PO-5640 for exactly $18,000.00. Everything checks out. R08 fires. Manager can approve (under $50,000). |
| 5 | sup_005 | INV-5075 | $7,950.00. Invoice shows a bank account that differs from the verified record. R01 fires. Supplier record holds a phone number and contact name for verification step 1. |
| 6a | sup_006 | INV-6122 | $2,140.00. Staged: J1 wrongly judges it legitimate although it duplicates INV-6119 (same goods, transposed invoice number). Proceeds as Routine. The payment run has not happened yet, so it can be pulled back. |
| 6b | sup_007 | INV-7230 | $3,775.00. Same shape as 6a, but the payment run has already executed. Opens a recovery case. |

Total synthetic volume for the demo: about 60 invoices across the twelve suppliers, mostly Routine, so the eight fixtures stand out in the queue. Seed script generates the filler deterministically from a fixed seed.

## Purchase orders

One open PO per fixture that needs one (PO-5521, PO-5598, PO-5640), plus filler POs. A closed PO exists for an R04 example (PO-5190, Alder & Finch, fully invoiced).

## Notes for the build

- Names, accounts and suppliers are fictional. Any resemblance to a real business is coincidental.
- Do not add a real bank, brand or person to the seed data.
- Anything added here that the brief does not mention is a proposal. Challenge it before building on it.
