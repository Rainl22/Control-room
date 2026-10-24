import { evidenceId, makeEvidence } from './evidence';
import type { Evidence, Invoice, InvoiceContext, PurchaseOrderLine } from './types';

/**
 * Step 4 of the pipeline: analysis packets. Anything countable, comparable or
 * searchable is done here, in code, and handed to the AI. The AI interprets;
 * it never computes similarity or arithmetic. Every number the interface shows
 * comes from here, with its inputs, as computed_stat evidence.
 */

export interface PacketParams {
  /** Candidates scoring at or above this go to the AI (brief: 0.75, tunable). */
  nearDuplicateThreshold: number;
  /** Prior invoices issued within this many days count as date-proximate. */
  dateWindowDays: number;
}

export const DEFAULT_PACKET_PARAMS: PacketParams = {
  nearDuplicateThreshold: 0.75,
  dateWindowDays: 180,
};

export interface SimilarityComponents {
  amount: number;
  invoiceNumber: number;
  lineOverlap: number;
  dateProximity: number;
}

export interface NearDuplicateCandidate {
  priorInvoiceId: string;
  priorInvoiceNumber: string;
  score: number;
  components: SimilarityComponents;
  evidenceIds: string[];
}

export interface LineDiff {
  poReference: string;
  /** Invoice lines with a matching PO line (by description similarity). */
  matched: Array<{ invoiceLineId: string; poLineId: string; amountDiffCents: number }>;
  /** Invoice lines with no counterpart on the PO. */
  extras: Array<{ invoiceLineId: string; description: string; amountCents: number }>;
  /** PO lines not billed on this invoice. */
  missing: Array<{ poLineId: string; description: string; amountCents: number }>;
  totalDiffCents: number;
}

export interface AnalysisPackets {
  nearDuplicates: NearDuplicateCandidate[];
  lineDiff?: LineDiff;
}

// ---------------------------------------------------------------------------
// Scoring primitives (deterministic, unit-testable)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const current = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = current;
  }
  return prev[n]!;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function daysBetween(isoA: string, isoB: string): number {
  const ms = Math.abs(new Date(`${isoA}T00:00:00Z`).getTime() - new Date(`${isoB}T00:00:00Z`).getTime());
  return Math.round(ms / 86_400_000);
}

/** Similarity of two invoices from the same supplier, 0..1. Weights are fixed. */
export function similarity(invoice: Invoice, prior: Invoice, params: PacketParams): SimilarityComponents & { score: number } {
  const maxAmount = Math.max(invoice.totalBaseCents, prior.totalBaseCents, 1);
  const amount = 1 - Math.abs(invoice.totalBaseCents - prior.totalBaseCents) / maxAmount;

  const aDigits = invoice.invoiceNumber.replace(/\D/g, '');
  const bDigits = prior.invoiceNumber.replace(/\D/g, '');
  const maxLen = Math.max(aDigits.length, bDigits.length, 1);
  const invoiceNumber = 1 - levenshtein(aDigits, bDigits) / maxLen;

  const aTokens = tokenize(invoice.lines.map((l) => l.description).join(' '));
  const bTokens = tokenize(prior.lines.map((l) => l.description).join(' '));
  const lineOverlap = jaccard(aTokens, bTokens);

  const days = daysBetween(invoice.issueDate, prior.issueDate);
  const dateProximity = Math.max(0, 1 - days / params.dateWindowDays);

  const score = 0.4 * amount + 0.15 * invoiceNumber + 0.35 * lineOverlap + 0.1 * dateProximity;
  return { amount, invoiceNumber, lineOverlap, dateProximity, score: Math.round(score * 1000) / 1000 };
}

// ---------------------------------------------------------------------------
// Packet builders
// ---------------------------------------------------------------------------

function matchLine(invoiceDescription: string, poLines: PurchaseOrderLine[]): PurchaseOrderLine | undefined {
  const tokens = tokenize(invoiceDescription);
  let best: { line: PurchaseOrderLine; score: number } | undefined;
  for (const poLine of poLines) {
    const score = jaccard(tokens, tokenize(poLine.description));
    if (score >= 0.5 && (!best || score > best.score)) best = { line: poLine, score };
  }
  return best?.line;
}

/**
 * Builds the packets and the computed_stat evidence that lets the AI cite them.
 * Pure: no AI, no network.
 */
export function buildPackets(
  invoice: Invoice,
  context: InvoiceContext,
  now: string,
  params: PacketParams = DEFAULT_PACKET_PARAMS,
): { packets: AnalysisPackets; evidence: Evidence[] } {
  const evidence: Evidence[] = [];

  // J1: near-duplicate candidates, scored in code; only >= threshold reach the AI.
  const nearDuplicates: NearDuplicateCandidate[] = [];
  for (const prior of context.priorInvoices) {
    const s = similarity(invoice, prior, params);
    if (s.score < params.nearDuplicateThreshold) continue;
    nearDuplicates.push({
      priorInvoiceId: prior.id,
      priorInvoiceNumber: prior.invoiceNumber,
      score: s.score,
      components: { amount: s.amount, invoiceNumber: s.invoiceNumber, lineOverlap: s.lineOverlap, dateProximity: s.dateProximity },
      evidenceIds: [
        evidenceId('prior_invoice', prior.invoiceNumber, 'invoice_number'),
        evidenceId('prior_invoice', prior.invoiceNumber, 'total'),
        evidenceId('computed', invoice.invoiceNumber, `similarity:${prior.invoiceNumber}`),
      ],
    });
    evidence.push(
      makeEvidence('computed_stat', 'computed', invoice.invoiceNumber, `similarity:${prior.invoiceNumber}`, s, now),
    );
  }
  nearDuplicates.sort((a, b) => b.score - a.score);

  // J2: line-item differences against the PO.
  let lineDiff: LineDiff | undefined;
  if (context.po) {
    const po = context.po;
    const matched: LineDiff['matched'] = [];
    const extras: LineDiff['extras'] = [];
    const usedPoLines = new Set<string>();
    for (const line of invoice.lines) {
      const poLine = matchLine(line.description, po.lines.filter((l) => !usedPoLines.has(l.id)));
      if (poLine) {
        usedPoLines.add(poLine.id);
        matched.push({ invoiceLineId: line.id, poLineId: poLine.id, amountDiffCents: line.amountCents - poLine.amountCents });
      } else {
        extras.push({ invoiceLineId: line.id, description: line.description, amountCents: line.amountCents });
      }
    }
    const missing = po.lines
      .filter((l) => !usedPoLines.has(l.id))
      .map((l) => ({ poLineId: l.id, description: l.description, amountCents: l.amountCents }));
    lineDiff = {
      poReference: po.reference,
      matched,
      extras,
      missing,
      totalDiffCents: invoice.totalBaseCents - po.totalCents,
    };
    evidence.push(makeEvidence('computed_stat', 'computed', invoice.invoiceNumber, 'line_diff', lineDiff, now));
  }

  return { packets: { nearDuplicates, lineDiff }, evidence };
}
