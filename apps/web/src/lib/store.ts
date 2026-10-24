'use client';

import {
  attemptTransition,
  buildSeed,
  can,
  canCoApproveLockedRuleChange,
  canPerformVerificationStep2,
  lockedRuleChangeApproved,
  evaluate,
  evidenceId,
  merge,
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
import { liveAvailability, liveClient } from './live-client';
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
  /** Whether the server route has an API key; detected at init. */
  liveMode: boolean;
  liveModel: string;
  init: () => Promise<void>;
  reset: () => Promise<void>;
  setCurrentUser: (userId: string) => void;
  setDisplayCurrency: (currency: CurrencyCode) => void;
  resolveReason: (invoiceId: string, reasonId: string, note: string, falseAlarm: boolean) => ActionResult;
  approve: (invoiceId: string) => ActionResult;
  reject: (invoiceId: string, reasonText: string) => ActionResult;
  recordVerificationStep1: (invoiceId: string, spokeTo: string, outcome: 'confirmed' | 'not_confirmed') => ActionResult;
  recordVerificationStep2: (invoiceId: string, outcome: 'confirmed' | 'rejected') => Promise<ActionResult>;
  changeRuleParameter: (ruleId: string, newParameters: Record<string, unknown>) => ActionResult;
  ruleHistory: RuleChangeEntry[];
  recoveryCases: RecoveryCase[];
  reportMistake: (invoiceId: string, note: string) => Promise<ActionResult>;
  toggleRecoveryStep: (caseId: string, stepIndex: number) => ActionResult;
  addSupplierFact: (invoiceId: string, text: string) => ActionResult;
  pendingRuleChanges: PendingRuleChange[];
  fileRuleRequest: (ruleId: string | null, description: string) => ActionResult;
  coApproveRuleChange: (requestId: string) => ActionResult;
}

/**
 * A requested change the interface cannot apply directly: a locked-rule
 * change (needs Manager + CFO co-approval; the requester cannot co-approve)
 * or a new-logic request (pending until a developer ships a new ruleset).
 */
export interface PendingRuleChange {
  id: string;
  /** null for a new-logic request outside any existing rule. */
  ruleId: string | null;
  description: string;
  requestedBy: string;
  requestedAt: string;
  approvals: Array<{ userId: string; role: 'operator' | 'manager' | 'cfo' }>;
  status: 'pending' | 'co_approved';
}

/**
 * Opened when a mistake is found after money has moved. Prototype-level
 * record: what was paid, the cause, and simulated next steps with owners.
 */
export interface RecoveryCase {
  id: string;
  invoiceId: string;
  amountCents: number;
  cause: string;
  openedBy: string;
  openedAt: string;
  steps: Array<{ action: string; ownerId: string; done: boolean }>;
}

export interface RuleChangeEntry {
  id: string;
  ruleId: string;
  rulesetVersion: number;
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  changedBy: string;
  effectiveFrom: string;
  at: string;
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

/**
 * Live by default on the genuine fixtures only (brief section 14): the staged
 * failures are always pinned, and the ~50 filler invoices never spend tokens.
 */
const GENUINE_FIXTURES = new Set(['inv_1187', 'inv_2041', 'inv_3302', 'inv_4410', 'inv_5075']);

function resolveClient(
  invoice: Invoice,
  live: boolean,
  liveModel: string,
): { client: AIClient; provenance: 'live' | 'recorded' | 'staged'; model: string } {
  const staged = stagedOutputFor(invoice.id);
  if (staged) return { client: async () => staged, provenance: 'staged', model: 'authored' };
  if (live && GENUINE_FIXTURES.has(invoice.id)) {
    return { client: liveClient, provenance: 'live', model: liveModel };
  }
  // Without live mode (or for filler), authored outputs stand in and are
  // labelled Staged example. They can never lower the class: the merge
  // keeps the rule floor regardless.
  const authored = PLACEHOLDER_OUTPUTS[invoice.id] ?? genericCleanOutput(invoice);
  return { client: async () => authored, provenance: 'staged', model: 'authored' };
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

  /**
   * Re-runs steps 2-6 after a context change. The authored outputs no longer
   * match the changed inputs, so this runs live when live mode is available;
   * otherwise the AI fails closed to Uncertainty (Unavailable) — exactly as
   * the product would (brief §14).
   */
  const reprocess = async (invoice: Invoice, auditNote: string) => {
    const { company, liveMode, liveModel } = get();
    const failClosed: AIClient = async () => {
      throw new Error('No live AI configured and no recorded run matches the changed inputs.');
    };
    const result = await runPipeline(invoice, toContextSources(company!), {
      ruleset: company!.ruleset,
      aiClient: liveMode ? liveClient : failClosed,
      model: liveMode ? liveModel : 'none',
      provenance: 'live',
      now: new Date().toISOString(),
      runId: nextId(`run_${invoice.id}`),
    });
    set((s) => ({ processed: { ...s.processed, [invoice.id]: { result } } }));
    logAudit(invoice.id, 'system', undefined, auditNote);
    return result;
  };

  return {
    company: null,
    processed: {},
    decisions: [],
    reviews: [],
    verifications: [],
    ruleHistory: [],
    recoveryCases: [],
    pendingRuleChanges: [],
    audit: [],
    currentUserId: 'usr_dana',
    displayCurrency: 'USD',
    status: 'idle',
    liveMode: false,
    liveModel: 'none',

    init: async () => {
      if (get().status !== 'idle') return;
      set({ status: 'processing', company: buildSeed(), processed: {}, decisions: [], reviews: [], verifications: [], audit: [], ruleHistory: [], recoveryCases: [], pendingRuleChanges: [] });
      const availability = await liveAvailability();
      set({ liveMode: availability.live, liveModel: availability.model });
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
        const { liveMode, liveModel } = get();
        const { client, provenance, model } = resolveClient(invoice, liveMode, liveModel);
        const result = await runPipeline(invoice, sources, {
          ruleset: company.ruleset,
          aiClient: client,
          model,
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
      set({ status: 'idle', company: null, processed: {}, decisions: [], reviews: [], verifications: [], audit: [], ruleHistory: [], recoveryCases: [], pendingRuleChanges: [] });
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

    /**
     * Hard-stop verification, step 1 (brief section 7): an Operator or Manager
     * contacts the supplier using the contact details already on the supplier
     * record — never those printed on the invoice — and records the outcome.
     */
    recordVerificationStep1: (invoiceId, spokeTo, outcome) => {
      const found = findInvoice(invoiceId);
      if (!found) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const { company, verifications } = get();
      if (!can(user.role, 'verification_step1')) {
        return { ok: false, refusal: 'Verification step 1 is performed by an Operator or a Manager, not the CFO.' };
      }
      if (verifications.some((v) => v.invoiceId === invoiceId && !v.step2)) {
        return { ok: false, refusal: 'Step 1 is already recorded and awaiting confirmation.' };
      }
      const supplier = company!.suppliers.find((s) => s.id === invoice.supplierId);
      const verification: Verification = {
        id: nextId('ver'),
        invoiceId,
        step1: {
          userId: user.id,
          contactUsed: supplier?.verifiedContact.phone ?? '',
          spokeTo,
          outcome,
          at: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      };
      set((s) => ({ verifications: [...s.verifications, verification] }));
      logAudit(invoiceId, 'user', user.id, `Verification step 1 by ${user.name}: spoke to ${spokeTo}, outcome ${outcome.replace('_', ' ')}.`);
      return { ok: true };
    },

    /**
     * Verification step 2: a different person with the Manager role confirms
     * or rejects. Confirmed: the bank details become the verified record and
     * the invoice returns to attention with a pipeline re-run. Not confirmed:
     * the invoice is rejected and the supplier flagged.
     */
    recordVerificationStep2: async (invoiceId, outcome) => {
      const found = findInvoice(invoiceId);
      if (!found) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const { company, verifications } = get();
      const verification = verifications.find((v) => v.invoiceId === invoiceId && !v.step2);
      if (!verification) return { ok: false, refusal: 'No step-1 record is awaiting confirmation.' };
      if (!canPerformVerificationStep2(user.role, verification.step1.userId, user.id)) {
        return {
          ok: false,
          refusal:
            verification.step1.userId === user.id
              ? 'The person who performed step 1 cannot perform step 2. With one Manager on the team, this case now waits — a deliberate policy choice.'
              : 'Verification step 2 needs the Manager role.',
        };
      }

      verification.step2 = { userId: user.id, outcome, at: new Date().toISOString() };
      set((s) => ({ verifications: [...s.verifications] }));

      if (outcome === 'confirmed') {
        // The account on the invoice becomes the verified record; the old one
        // is superseded. An unverified supplier becomes verified.
        const supplier = company!.suppliers.find((s) => s.id === invoice.supplierId)!;
        const nowIso = new Date().toISOString();
        for (const account of company!.bankAccounts) {
          if (account.supplierId === supplier.id && account.status === 'verified') account.status = 'superseded';
        }
        company!.bankAccounts.push({
          id: nextId('ba'),
          supplierId: supplier.id,
          holder: invoice.bankDetailsOnInvoice.holder,
          accountNumber: invoice.bankDetailsOnInvoice.accountNumber,
          country: invoice.bankDetailsOnInvoice.country,
          status: 'verified',
          verifiedBy: user.id,
          verifiedAt: nowIso,
        });
        supplier.status = 'verified';
        logAudit(invoiceId, 'user', user.id, `Verification confirmed by ${user.name}. Bank details marked verified on the supplier record.`);

        const transition = attemptTransition(invoice.state, 'awaiting_attention', { verificationConfirmed: true });
        if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };
        invoice.state = 'awaiting_attention';
        await reprocess(invoice, 'Re-evaluated after verification: the context changed.');
        return { ok: true };
      }

      const transition = attemptTransition(invoice.state, 'rejected', {
        verificationNotConfirmed: true,
        actorRole: user.role,
        rejectionReason: 'Supplier did not confirm the bank details.',
      });
      if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };
      invoice.state = 'rejected';
      const supplier = company!.suppliers.find((s) => s.id === invoice.supplierId)!;
      supplier.facts.push({
        id: nextId('fact'),
        text: `Flagged: bank-detail verification failed on ${invoice.invoiceNumber}.`,
        setBy: user.id,
        setAt: new Date().toISOString(),
      });
      recordDecision(invoice, user, 'reject', 'Supplier did not confirm the bank details.');
      logAudit(invoiceId, 'user', user.id, 'Verification not confirmed. Invoice rejected and supplier flagged.');
      set((s) => ({ processed: { ...s.processed } }));
      return { ok: true };
    },

    /**
     * Edit one parameter of one existing rule: permission check, a new ruleset
     * version with an effective date, rule history, and re-evaluation of every
     * open invoice. The existing AI run is kept — only the rule floor moved —
     * and every state change still goes through the guards (a rule change is
     * a correction, scope rule_parameter).
     */
    changeRuleParameter: (ruleId, newParameters) => {
      const { company, currentUserId, processed } = get();
      if (!company) return { ok: false, refusal: 'No company loaded.' };
      const user = company.users.find((u) => u.id === currentUserId)!;
      const rule = company.ruleset.rules.find((r) => r.id === ruleId);
      if (!rule) return { ok: false, refusal: `Unknown rule ${ruleId}.` };
      if (rule.locked) {
        return { ok: false, refusal: 'This rule is locked. Changing it needs a Manager and the CFO to co-approve, and the requester cannot co-approve.' };
      }
      if (!can(user.role, 'edit_rule_parameter', { rule })) {
        return {
          ok: false,
          refusal:
            user.role === 'manager'
              ? 'Only the CFO may edit this rule.'
              : 'Editing rule parameters needs the Manager role or above.',
        };
      }

      const previous = { ...rule.parameters };
      rule.parameters = { ...rule.parameters, ...newParameters };
      rule.version += 1;
      rule.effectiveFrom = company.settings.demoToday;
      company.ruleset.version += 1;

      const entry: RuleChangeEntry = {
        id: nextId('rch'),
        ruleId,
        rulesetVersion: company.ruleset.version,
        previous,
        next: { ...rule.parameters },
        changedBy: user.id,
        effectiveFrom: rule.effectiveFrom,
        at: new Date().toISOString(),
      };
      set((s) => ({ ruleHistory: [...s.ruleHistory, entry] }));

      // Re-evaluate every open invoice under the new ruleset, keeping each
      // invoice's existing AI run: its inputs did not change, only the floor.
      const open = company.invoices.filter((i) =>
        ['ready', 'awaiting_attention', 'blocked'].includes(i.state),
      );
      for (const invoice of open) {
        const record = processed[invoice.id];
        if (!record) continue;
        const toChecking = attemptTransition(invoice.state, 'checking', { correction: { scope: 'rule_parameter' } });
        if (!toChecking.allowed) continue;
        const context = record.result.context;
        const ruleResults = evaluate(invoice, context, company.ruleset);
        const run = record.result.aiRun;
        const outcome =
          run.status === 'succeeded' && run.output
            ? ({ status: 'succeeded', output: run.output } as const)
            : ({ status: 'failed', failureType: run.failureType ?? 'error' } as const);
        const merged = merge(invoice, ruleResults, outcome, company.ruleset);
        const target =
          merged.finalClass === 'routine' ? 'ready' : merged.finalClass === 'hard_stop' ? 'blocked' : 'awaiting_attention';
        const routed = attemptTransition('checking', target, { finalClass: merged.finalClass });
        if (routed.allowed && invoice.state !== target) {
          invoice.state = target;
          logAudit(invoice.id, 'system', undefined, `Re-evaluated after ${ruleId} changed (ruleset v${company.ruleset.version}); class is now ${merged.finalClass}.`);
        }
        set((s) => ({
          processed: { ...s.processed, [invoice.id]: { result: { ...record.result, ruleResults, merge: merged } } },
        }));
      }
      return { ok: true };
    },

    /**
     * Report a mistake (any role). Timing decides everything: before the
     * payment run the invoice is pulled back, the payment recalled and the
     * pipeline re-run; after it, nothing can be undone and a recovery case
     * opens. Either way, if the AI had judged the invoice clean, a "missed"
     * verdict is appended to the original run — which is never edited.
     */
    reportMistake: async (invoiceId, note) => {
      const found = findInvoice(invoiceId);
      const record = get().processed[invoiceId];
      if (!found) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const { company } = get();

      const appendMissedVerdict = () => {
        if (!record || record.result.aiRun.status !== 'succeeded') return;
        const review: JudgmentReview = {
          id: nextId('jr'),
          aiRunId: record.result.aiRun.id,
          job: 'J1',
          verdict: 'missed',
          setBy: user.id,
          setVia: 'correction',
          setAt: new Date().toISOString(),
        };
        set((s) => ({ reviews: [...s.reviews, review] }));
        logAudit(invoiceId, 'user', user.id, 'AI run marked as missed (verdict appended; the run itself is unchanged).');
      };

      if (invoice.state === 'paid') {
        const transition = attemptTransition('paid', 'recovery', { mistakeReported: true });
        if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };
        invoice.state = 'recovery';
        const payment = company!.payments.find((p) => p.invoiceId === invoiceId && p.status === 'paid');
        const supplier = company!.suppliers.find((s) => s.id === invoice.supplierId)!;
        const manager = company!.users.find((u) => u.role === 'manager')!;
        const recovery: RecoveryCase = {
          id: nextId('rec'),
          invoiceId,
          amountCents: payment?.amountCents ?? invoice.totalBaseCents,
          cause: note,
          openedBy: user.id,
          openedAt: new Date().toISOString(),
          steps: [
            { action: `Request a recall from ${supplier.name} (simulated)`, ownerId: manager.id, done: false },
            { action: 'Request a recall from the bank (simulated)', ownerId: manager.id, done: false },
            { action: 'Review how this invoice passed as Routine', ownerId: manager.id, done: false },
          ],
        };
        set((s) => ({ recoveryCases: [...s.recoveryCases, recovery] }));
        supplier.facts.push({
          id: nextId('fact'),
          text: `Flagged: mistaken payment on ${invoice.invoiceNumber}; recovery case open.`,
          setBy: user.id,
          setAt: new Date().toISOString(),
        });
        recordDecision(invoice, user, 'report_mistake', note);
        logAudit(invoiceId, 'user', user.id, `Mistake reported after payment: ${note}. It cannot be undone; a recovery case is open.`);
        appendMissedVerdict();
        set((s) => ({ processed: { ...s.processed } }));
        return { ok: true };
      }

      if (invoice.state === 'payment_scheduled' || invoice.state === 'ready') {
        const correction = { scope: 'this_invoice' as const };
        if (invoice.state === 'payment_scheduled') {
          const transition = attemptTransition('payment_scheduled', 'checking', { beforePaymentRun: true, correction });
          if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };
          const payment = company!.payments.find((p) => p.invoiceId === invoiceId && p.status === 'scheduled');
          if (payment) payment.status = 'recalled';
        } else {
          const transition = attemptTransition('ready', 'checking', { correction });
          if (!transition.allowed) return { ok: false, refusal: refusalOf(transition) };
        }
        invoice.state = 'checking';
        recordDecision(invoice, user, 'report_mistake', note);
        logAudit(invoiceId, 'user', user.id, `Mistake reported before the payment run: ${note}. Pulled back; the pipeline re-runs.`);
        appendMissedVerdict();
        const result = await reprocess(invoice, 'Re-evaluated after the correction.');
        const target =
          result.merge.finalClass === 'routine' ? 'ready' : result.merge.finalClass === 'hard_stop' ? 'blocked' : 'awaiting_attention';
        const routed = attemptTransition('checking', target, { finalClass: result.merge.finalClass });
        invoice.state = routed.allowed ? target : 'checking';
        set((s) => ({ processed: { ...s.processed } }));
        return { ok: true };
      }

      return { ok: false, refusal: 'A mistake is reported on an invoice that is proceeding, scheduled or paid.' };
    },

    /**
     * Supplier-scope correction (Manager or CFO): a structured supplier fact,
     * labelled with who set it and when. It enters the assembled context as
     * evidence on every future evaluation of this supplier — nothing is
     * learned silently. (Open invoices re-check live once live mode exists.)
     */
    addSupplierFact: (invoiceId, text) => {
      const found = findInvoice(invoiceId);
      if (!found) return { ok: false, refusal: 'Unknown invoice.' };
      const { invoice, user } = found;
      const { company } = get();
      if (!can(user.role, 'supplier_scope_correction')) {
        return { ok: false, refusal: 'A supplier-scope correction needs the Manager role or above.' };
      }
      const supplier = company!.suppliers.find((s) => s.id === invoice.supplierId)!;
      supplier.facts.push({ id: nextId('fact'), text, setBy: user.id, setAt: new Date().toISOString() });
      logAudit(invoiceId, 'user', user.id, `Supplier fact added for ${supplier.name}: "${text}"`);
      set((s) => ({ processed: { ...s.processed } }));
      return { ok: true };
    },

    /**
     * File a change the interface cannot make: a locked-rule change or a
     * new-logic request. Logged as pending in the rule history. A finance
     * manager cannot invent a rule — nothing changes behaviour until a
     * developer ships a new ruleset version.
     */
    fileRuleRequest: (ruleId, description) => {
      const { company, currentUserId } = get();
      const user = company?.users.find((u) => u.id === currentUserId);
      if (!user || !can(user.role, 'file_new_logic')) {
        return { ok: false, refusal: 'Filing a rule-change request needs the Manager role or above.' };
      }
      const request: PendingRuleChange = {
        id: nextId('req'),
        ruleId,
        description,
        requestedBy: user.id,
        requestedAt: new Date().toISOString(),
        approvals: [],
        status: 'pending',
      };
      set((s) => ({ pendingRuleChanges: [...s.pendingRuleChanges, request] }));
      return { ok: true };
    },

    /**
     * Co-approve a locked-rule change: the two approvers must be a Manager
     * and the CFO, and the requester cannot be one of them (core permissions
     * decide). Even co-approved, the change ships only as a new ruleset
     * version by a developer — the interface records, it does not apply.
     */
    coApproveRuleChange: (requestId) => {
      const { company, currentUserId, pendingRuleChanges } = get();
      const user = company?.users.find((u) => u.id === currentUserId);
      if (!user) return { ok: false, refusal: 'No user.' };
      const request = pendingRuleChanges.find((r) => r.id === requestId);
      if (!request || request.status !== 'pending') return { ok: false, refusal: 'No pending request.' };
      if (!canCoApproveLockedRuleChange(user.role, request.requestedBy, user.id)) {
        return {
          ok: false,
          refusal:
            request.requestedBy === user.id
              ? 'The person who requested a locked-rule change cannot co-approve it.'
              : 'Co-approval needs the Manager role or the CFO.',
        };
      }
      if (request.approvals.some((a) => a.userId === user.id)) {
        return { ok: false, refusal: 'Already approved by this person.' };
      }
      request.approvals.push({ userId: user.id, role: user.role });
      if (lockedRuleChangeApproved(request.requestedBy, request.approvals)) {
        request.status = 'co_approved';
      }
      set((s) => ({ pendingRuleChanges: [...s.pendingRuleChanges] }));
      return { ok: true };
    },

    toggleRecoveryStep: (caseId, stepIndex) => {
      const { company, currentUserId, recoveryCases } = get();
      const user = company?.users.find((u) => u.id === currentUserId);
      if (!user || !can(user.role, 'work_recovery')) {
        return { ok: false, refusal: 'Working a recovery case needs the Manager role or above.' };
      }
      const recovery = recoveryCases.find((c) => c.id === caseId);
      const step = recovery?.steps[stepIndex];
      if (!recovery || !step) return { ok: false, refusal: 'Unknown recovery step.' };
      step.done = !step.done;
      logAudit(recovery.invoiceId, 'user', user.id, `Recovery step ${step.done ? 'completed' : 'reopened'}: ${step.action}`);
      set((s) => ({ recoveryCases: [...s.recoveryCases] }));
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
