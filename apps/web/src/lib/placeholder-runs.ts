import { evidenceId, type AIOutput } from '@control-room/core';

/**
 * TEMPORARY authored outputs for the genuine fixtures (1, 2a, 3, 4, 5), used
 * until real model runs are recorded via the API (which needs an API key).
 * They are honestly labelled "Staged example" while in use — never "Recorded".
 * Once scripts/record-runs captures genuine outputs, these are replaced and
 * only fixtures 2b, 6a and 6b stay staged, as the brief specifies.
 */

const ev = evidenceId;

export const PLACEHOLDER_OUTPUTS: Record<string, AIOutput> = {
  inv_1187: {
    findings: [
      {
        job: 'J5',
        assessment: 'supports',
        description: 'The invoice matches PO-5521 to the cent and the bank details match the verified record.',
        evidenceIds: [ev('invoice', 'INV-1187', 'total'), ev('po', 'PO-5521', 'total')],
      },
    ],
    proposedClass: 'routine',
    proposedAction: 'proceed',
    brief:
      'A routine invoice from Alder & Finch Packaging. The amount matches the open purchase order exactly, the supplier is verified, and the bank details match the verified record. No attention needed; it will be paid in the next run before its due date.',
  },
  inv_2041: {
    findings: [
      {
        job: 'J1',
        assessment: 'contradicts',
        description:
          'INV-2041 bills the April 2025 cleaning service, but INV-2014 for the same service and amount was already paid in April. This is a likely repeat.',
        evidenceIds: [
          ev('computed', 'INV-2041', 'similarity:INV-2014'),
          ev('prior_invoice', 'INV-2014', 'total'),
          ev('prior_invoice', 'INV-2014', 'issue_date'),
        ],
      },
    ],
    proposedClass: 'uncertainty',
    proposedAction: 'query_supplier',
    brief:
      'This invoice from Brightwater Cleaning Services appears to bill the April service a second time: INV-2014, for the same amount and the same month, was paid in April. Recommend querying the supplier before paying. If they confirm it is a duplicate, reject it.',
  },
  inv_3302: {
    findings: [
      {
        job: 'J2',
        assessment: 'unclear',
        description:
          'The invoice exceeds PO-5598 by $60.00. The difference is a single fuel-surcharge freight line not on the PO; Copperline Freight commonly adds freight lines.',
        evidenceIds: [ev('computed', 'INV-3302', 'line_diff'), ev('po', 'PO-5598', 'total')],
      },
    ],
    proposedClass: 'uncertainty',
    proposedAction: 'accept_difference',
    brief:
      'The invoice is $60.00 over its purchase order, beyond the allowed tolerance, which is why a person must look. The whole difference is one fuel-surcharge line. Recommend accepting the difference with a note, or querying the supplier if the surcharge was not agreed.',
  },
  inv_4410: {
    findings: [
      {
        job: 'J5',
        assessment: 'supports',
        description:
          'The invoice matches PO-5640 exactly and the supplier and bank details are verified. It needs a signature only because it is above the $10,000 approval threshold.',
        evidenceIds: [ev('invoice', 'INV-4410', 'total'), ev('po', 'PO-5640', 'total')],
      },
    ],
    proposedClass: 'authority',
    proposedAction: 'approve',
    brief:
      'Everything on this Delmar Industrial Equipment invoice checks out: the amount matches the purchase order exactly and the payment details match the verified record. Policy requires a named person to sign for any amount above $10,000. A Manager can approve this one.',
  },
  inv_5075: {
    findings: [
      {
        job: 'J5',
        assessment: 'contradicts',
        description:
          'The bank account printed on the invoice does not match the verified record for Evergreen Pallet Co. This is the pattern of a payment-diversion attempt and must be verified by phone, never using contact details from the invoice.',
        evidenceIds: [
          ev('invoice', 'INV-5075', 'bank_details_on_invoice'),
          ev('bank', 'ba_005', 'account_number'),
        ],
      },
    ],
    proposedClass: 'hard_stop',
    proposedAction: 'verify_bank_details',
    brief:
      'Payment is blocked: the account on the invoice differs from the verified record. Approval alone cannot clear this. Someone must contact the supplier using the phone number already on file, record the outcome, and a second person must confirm it before the invoice can move.',
  },
};
