import { evidenceId } from '../evidence';
import type { AIOutput } from '../types';

/**
 * Staged examples (brief section 4): deliberately authored outputs that
 * demonstrate the failure fixtures — one false alarm (2b) and two misses
 * (6a, 6b). A live model might judge these cases correctly on the day, so
 * they are pinned and always labelled "Staged example"; they never pass as
 * model output. Every other fixture runs live, with genuine recorded runs
 * as the fallback (captured by scripts/record-runs once the API is wired).
 */

const ev = evidenceId;

export const STAGED_OUTPUTS: Record<string, AIOutput> = {
  // Fixture 2b — false alarm: J1 wrongly flags a legitimate monthly invoice.
  inv_2087: {
    findings: [
      {
        job: 'J1',
        assessment: 'contradicts',
        description:
          'INV-2087 matches prior invoice INV-2041 on amount and service description. This looks like a likely repeat of the same billing.',
        evidenceIds: [
          ev('invoice', 'INV-2087', 'total'),
          ev('prior_invoice', 'INV-2041', 'total'),
          ev('computed', 'INV-2087', 'similarity:INV-2041'),
        ],
      },
    ],
    proposedClass: 'uncertainty',
    proposedAction: 'query_supplier',
    brief:
      'This invoice from Brightwater Cleaning Services closely matches a recent invoice for the same amount and service. It may be a repeat billing. Confirm with the supplier before paying.',
  },

  // Fixture 6a — miss: J1 wrongly judges a true duplicate legitimate (caught before the run).
  inv_6122: {
    findings: [
      {
        job: 'J1',
        assessment: 'supports',
        description:
          'INV-6122 resembles INV-6119, but Fairhaven Office Supply bills recurring stationery orders of similar size; this appears to be a legitimate recurrence.',
        evidenceIds: [
          ev('invoice', 'INV-6122', 'total'),
          ev('prior_invoice', 'INV-6119', 'total'),
          ev('computed', 'INV-6122', 'similarity:INV-6119'),
        ],
      },
    ],
    proposedClass: 'routine',
    proposedAction: 'proceed',
    brief:
      'A similar recent invoice exists, but the pattern is consistent with recurring supply orders from this supplier. No issues found; the invoice can proceed.',
  },

  // Fixture 6b — the same miss, caught only after the payment run.
  inv_7230: {
    findings: [
      {
        job: 'J1',
        assessment: 'supports',
        description:
          'INV-7230 resembles INV-7198, but Granite State Utilities bills monthly; this appears to be a legitimate recurring utility charge.',
        evidenceIds: [
          ev('invoice', 'INV-7230', 'total'),
          ev('prior_invoice', 'INV-7198', 'total'),
          ev('computed', 'INV-7230', 'similarity:INV-7198'),
        ],
      },
    ],
    proposedClass: 'routine',
    proposedAction: 'proceed',
    brief:
      'A similar recent invoice exists, but monthly utility billing is expected from this supplier. No issues found; the invoice can proceed.',
  },
};

export function stagedOutputFor(invoiceId: string): AIOutput | undefined {
  return STAGED_OUTPUTS[invoiceId];
}
