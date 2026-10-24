'use client';

import {
  attemptTransition,
  buildSeed,
  can,
  evidenceId,
  runPipeline,
  stagedOutputFor,
  thursdayOnOrBefore,
  addDays,
  toContextSources,
  type AIClient,
  type AIOutput,
  type AuditEvent,
  type CurrencyCode,
  type Decision,
  type Invoice,
  type InvoiceState,
  type JudgmentReview,
  type PipelineResult,
  type SeedData,
  type TransitionResult,
  type User,
  type Verification,
} from '@control-room/core';
import { create } from 'zustand';
import { deriveGates, hardStopActive, hasSignatureGate, nonSignatureGatesCleared, resolveActionId } from './gates';
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

export type ActionResult = { ok: true } | { ok: false; refusal: string };

interface CompanyState {
  company: SeedData | null;
  processed: Record<string, ProcessedRecord>;
  decisions: Decision[];
  reviews: JudgmentReview[];
  verifications: Verification[];
  audit: AuditEvent[];
  currentUserId: string;
  displayCurrency: CurrencyCode;
  status: 'idle' | 'processing' | 'ready';
  init: () => Promise<void>;
  reset: () => Promise<void>;
  setCurrentUser: (userId: string) => void;
  setDisplayCurrency: (currency: CurrencyCode) => void;
  resolveReason: (invoiceId: string, reasonId: string, note: string, falseAlarm: boolean) => ActionResult;
  approve: (invoiceId: string) => ActionResult;
  reject: (invoiceId: string, reasonText: string) => ActionResult;
}

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

let decisionSeq = 0;
const nextId = (prefix: string) => `${prefix}_${++decisionSeq}`;

function refusalOf(result: TransitionResult): string {
  return result.allowed ? '' : result.refusal;
}

export const useCompany = create<CompanyState>((set, get) => {
  /** Shared helpers reading current state; mutations always re-set objects. */
  const findInvoice = (invoiceId: string): { invoice: Invoice; user: User } | null => {
    const { company, currentUserId } = get();
    if (!company) return null;
    const invoice = company.invoices.find((i) => i.id === invoiceId);
    const user = company.users.find((u) => u.id === currentUserId);
    if (!invoice || !user) return null;
    return { invoice, user };
  };

  const gatesFor = (invoiceId: string) => {
    const { processed, decisions, verifications } = get();
    const reasons = processed[invoiceId]?.result.merge.reasons ?? [];
    return deriveGates(reasons, {
      decisions: decisions.filter((d) => d.invoiceId === invoiceId),
      verifications: verifications.filter((v) => v.invoiceId === invoiceId),
      approved: false,
    });
  };

  const logAudit = (invoiceId: string, actor: AuditEvent['actor'], actorId: string | undefined, event: string) => {
    const { company } = get();
    const entry: AuditEvent = {
      id: nextId('aud'),
      invoiceId,
      actor,
      actorId,
      event,
      rulesetVersion: company?.ruleset.version ?? 0,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ audit: [...s.audit, entry] }));
  };

  const recordDecision = (invoice: Invoice, user: User, action: string, reasonText: string) => {
    const { processed } = get();
    const decision: Decision = {
      id: nextId('dec'),
      invoiceId: invoice.id,
      userId: user.id,
      role: user.role,
      action,
      reasonText,
      evidenceIdsSeen: processed[invoice.id]?.result.context.evidence.map((e) => e.id) ?? [],
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ decisions: [...s.decisions, decision] }));
    return decision;
  };

  return {
    company: null,
    processed: {},
    decisions: [],
    reviews: [],
    verifications: [],
    audit: [],
    currentUserId: 'usr_dana',
    displayCurrency: 'USD',
    status: 'idle',

    init: async () => {
      if (get().status !== 'idle') return;
      set({ status: 'processing', company: buildSeed(), processed: {}, decisions: [], reviews: [], verifications: [], audit: [] });
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
      set({ status: 'idle', company: null, processed: {}, decisions: [], reviews: [], verifications: [], audit: [] });
      await get().init();
    },

    setCurrentUser: (userId) => set({ currentUserId: userId }),
    setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),

    /**
     * Resolve one Uncertainty gate. The decision is the fact that clears the
     * gate; dismissing an AI finding as a false alarm also appends a
     * JudgmentReview verdict to the run — the run itself is never edited.
     */
    resolveReason: (invoiceId, reasonId, note, falseAlarm) => {
      const found = findInvoice(invoiceId);
      const record = get().processed[invoiceId];
      if (!found || !record) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const reason = record.result.merge.reasons.find((r) => r.id === reasonId);
      if (!reason || reason.class !== 'uncertainty') return { ok: false, refusal: 'Not an open Uncertainty reason.' };

      if (!can(user.role, 'resolve_uncertainty', { amountBaseCents: invoice.totalBaseCents })) {
        return { ok: false, refusal: 'An Operator may resolve Uncertainty up to $10,000. This amount needs a Manager.' };
      }

      recordDecision(invoice, user, resolveActionId(reasonId), note);
      logAudit(invoiceId, 'user', user.id, `Resolved ${reason.sourceId}: ${note}`);

      if (falseAlarm && reason.source === 'ai') {
        const review: JudgmentReview = {
          id: nextId('jr'),
          aiRunId: record.result.aiRun.id,
          job: (reason.sourceId as JudgmentReview['job']) ?? 'J1',
          verdict: 'false_alarm',
          setBy: user.id,
          setVia: 'dismissal',
          setAt: new Date().toISOString(),
        };
        set((s) => ({ reviews: [...s.reviews, review] }));
        logAudit(invoiceId, 'user', user.id, 'AI finding marked as a false alarm (verdict appended to the run).');
      }
      set((s) => ({ decisions: [...s.decisions] })); // trigger subscribers
      return { ok: true };
    },

    /**
     * Approve / release the invoice. The state-machine guard decides, with the
     * role limits that match the rules triggered. On success the payment is
     * scheduled for the next Thursday run.
     */
    approve: (invoiceId) => {
      const found = findInvoice(invoiceId);
      const record = get().processed[invoiceId];
      if (!found || !record) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const { company } = get();
      const gates = gatesFor(invoiceId);

      const transition = attemptTransition(invoice.state, 'approved', {
        allGatesCleared: nonSignatureGatesCleared(gates),
        approval: { role: user.role },
        amountBaseCents: invoice.totalBaseCents,
        requiresSignature: hasSignatureGate(gates),
        ruleset: company!.ruleset,
      });
      if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };

      invoice.state = 'approved';
      recordDecision(invoice, user, 'approve', 'Approved for payment.');
      logAudit(invoiceId, 'user', user.id, `Approved by ${user.name} (${user.role}).`);

      const schedule = attemptTransition('approved', 'payment_scheduled', {
        hardStopGateActive: hardStopActive(gates),
      });
      if (schedule.allowed) {
        const supplier = company!.suppliers.find((s) => s.id === invoice.supplierId);
        const today = company!.settings.demoToday;
        const nextThursday = thursdayOnOrBefore(addDays(today, 7));
        invoice.state = 'payment_scheduled';
        company!.payments.push({
          id: nextId('pay'),
          invoiceId: invoice.id,
          fundingAccountId: supplier?.fundingAccountId ?? 'acct_ops',
          amountCents: invoice.totalBaseCents,
          currency: 'USD',
          scheduledFor: nextThursday,
          status: 'scheduled',
        });
        logAudit(invoiceId, 'system', undefined, `Payment scheduled for the ${nextThursday} run.`);
      }
      set((s) => ({ processed: { ...s.processed } })); // trigger subscribers
      return { ok: true };
    },

    reject: (invoiceId, reasonText) => {
      const found = findInvoice(invoiceId);
      if (!found) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const transition = attemptTransition(invoice.state, 'rejected', {
        actorRole: user.role,
        rejectionReason: reasonText,
      });
      if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };
      invoice.state = 'rejected';
      recordDecision(invoice, user, 'reject', reasonText);
      logAudit(invoiceId, 'user', user.id, `Rejected by ${user.name} (${user.role}): ${reasonText}`);
      set((s) => ({ processed: { ...s.processed } }));
      return { ok: true };
    },
  };
});
