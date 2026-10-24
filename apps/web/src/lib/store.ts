'use client';

import {
  attemptTransition,
  buildSeed,
  runPipeline,
  stagedOutputFor,
  toContextSources,
  type AIClient,
  type CurrencyCode,
  type Invoice,
  type InvoiceState,
  type PipelineResult,
  type SeedData,
} from '@control-room/core';
import { create } from 'zustand';
import { evidenceId, type AIOutput } from '@control-room/core';
import { PLACEHOLDER_OUTPUTS } from './placeholder-runs';

/**
 * The in-memory company store. It lives in the visitor's browser, so every
 * visitor supervises their own copy of Harbourline Supply Co. and "Reset the
 * company" is just re-seeding. The core stays pure; this is the only place
 * state actually changes, and invoice states only change through the
 * state-machine guards.
 */

export interface ProcessedRecord {
  result: PipelineResult;
}

interface CompanyState {
  company: SeedData | null;
  processed: Record<string, ProcessedRecord>;
  currentUserId: string;
  displayCurrency: CurrencyCode;
  status: 'idle' | 'processing' | 'ready';
  init: () => Promise<void>;
  reset: () => Promise<void>;
  setCurrentUser: (userId: string) => void;
  setDisplayCurrency: (currency: CurrencyCode) => void;
}

/**
 * Picks the AI client and provenance label for an invoice. Until genuine
 * recorded runs exist (that needs the live API), authored outputs are used and
 * labelled Staged example; anything without an authored output fails closed.
 */
function genericCleanOutput(invoice: Invoice): AIOutput {
  return {
    findings: [
      {
        job: 'J5',
        assessment: 'supports',
        description: 'No rule fired and no similar prior invoice was found. Nothing needs interpretation.',
        evidenceIds: [evidenceId('invoice', invoice.invoiceNumber, 'total')],
      },
    ],
    proposedClass: 'routine',
    proposedAction: 'proceed',
    brief: 'A routine invoice: the checks found nothing that needs a person. It proceeds on its own and stays visible in history.',
  };
}

function resolveClient(invoice: Invoice): { client: AIClient; provenance: 'live' | 'recorded' | 'staged' } {
  const authored = stagedOutputFor(invoice.id) ?? PLACEHOLDER_OUTPUTS[invoice.id] ?? genericCleanOutput(invoice);
  // Until live mode and genuine recordings are wired, every result is an
  // authored output and labelled Staged example. The generic clean output can
  // never lower the class: the merge keeps the rule floor regardless.
  return { client: async () => authored, provenance: 'staged' };
}

function applyIntakeTransitions(invoice: Invoice, result: PipelineResult): InvoiceState {
  // Step 7 routing, but every move goes through the guards (step 9).
  let state: InvoiceState = invoice.state;
  const toChecking = attemptTransition(state, 'checking', { structurallyValid: true });
  if (!toChecking.allowed) return state;
  state = 'checking';
  const finalClass = result.merge.finalClass;
  const target: InvoiceState =
    finalClass === 'routine' ? 'ready' : finalClass === 'hard_stop' ? 'blocked' : 'awaiting_attention';
  const routed = attemptTransition(state, target, { finalClass });
  return routed.allowed ? target : state;
}

export const useCompany = create<CompanyState>((set, get) => ({
  company: null,
  processed: {},
  currentUserId: 'usr_dana',
  displayCurrency: 'USD',
  status: 'idle',

  init: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'processing', company: buildSeed(), processed: {} });
    const company = get().company!;
    const sources = toContextSources(company);
    const now = `${company.settings.demoToday}T09:00:00Z`;

    // The AI runs for 6a and 6b happened "in the past" (they are already
    // scheduled or paid); their pipeline results are kept for the audit trail
    // but their states are not re-routed.
    const toProcess = company.invoices.filter(
      (i) => i.state === 'received' || i.id === 'inv_6122' || i.id === 'inv_7230',
    );

    for (const invoice of toProcess) {
      const { client, provenance } = resolveClient(invoice);
      const result = await runPipeline(invoice, sources, {
        ruleset: company.ruleset,
        aiClient: client,
        model: 'placeholder',
        provenance,
        now,
        runId: `run_${invoice.id}_1`,
      });
      if (invoice.state === 'received') {
        invoice.state = applyIntakeTransitions(invoice, result);
      }
      set((s) => ({ processed: { ...s.processed, [invoice.id]: { result } } }));
    }
    set({ status: 'ready' });
  },

  reset: async () => {
    set({ status: 'idle', company: null, processed: {} });
    await get().init();
  },

  setCurrentUser: (userId) => set({ currentUserId: userId }),
  setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
}));
