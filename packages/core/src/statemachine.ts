import { can, managerApprovalLimitCents } from './permissions';
import type { CorrectionScope, InvoiceState, OutcomeClass, Role, Ruleset } from './types';

/**
 * The state machine, docs/BRIEF.md section 6. The interface hides buttons a
 * person may not press, but the guard is what refuses. It runs here, outside
 * the prompt and the UI, and the AI has no access to it.
 */

export interface GuardContext {
  /** Final class from the merge, where a guard depends on it. */
  finalClass?: OutcomeClass;
  /** Record arrived structurally valid (Received -> Checking). */
  structurallyValid?: boolean;
  /** Role of the person attempting the transition, where one is required. */
  actorRole?: Role;
  /** Invoice amount in base cents, for approval limits. */
  amountBaseCents?: number;
  /** An approval exists from this role (Awaiting attention -> Approved). */
  approval?: { role: Role };
  /** Every gate on the invoice is cleared (derived from facts, never ticked). */
  allGatesCleared?: boolean;
  /** A hard-stop gate is still active. */
  hardStopGateActive?: boolean;
  /** What is awaited and who owns it (Awaiting attention -> On hold). */
  hold?: { awaiting: string; owner: string };
  /** Evidence recorded as received (On hold -> Awaiting attention). */
  evidenceReceived?: boolean;
  /** The verification path is complete and confirmed (Blocked -> Awaiting attention). */
  verificationConfirmed?: boolean;
  /** A re-run finished (Investigating -> Awaiting attention). */
  rerunComplete?: boolean;
  /** A correction record exists with its scope. */
  correction?: { scope: CorrectionScope };
  /** A rejection reason was recorded. */
  rejectionReason?: string;
  /** The payment run has not executed yet (Payment scheduled -> Checking). */
  beforePaymentRun?: boolean;
  /** The simulated payment run executed (Payment scheduled -> Paid). */
  paymentRunExecuted?: boolean;
  /** A mistake was reported after payment (Paid -> Recovery). */
  mistakeReported?: boolean;
  ruleset?: Ruleset;
}

export type TransitionResult = { allowed: true } | { allowed: false; refusal: string };

const refuse = (refusal: string): TransitionResult => ({ allowed: false, refusal });
const allow: TransitionResult = { allowed: true };

type Guard = (ctx: GuardContext) => TransitionResult;

/** States an invoice can leave via a correction, before money moves. */
const CORRECTABLE_STATES: InvoiceState[] = [
  'ready',
  'awaiting_attention',
  'investigating',
  'on_hold',
  'blocked',
  'approved',
];

const TRANSITIONS: Record<string, Guard> = {
  'received->checking': (ctx) =>
    ctx.structurallyValid ? allow : refuse('The record is not structurally valid.'),

  'checking->ready': (ctx) =>
    ctx.finalClass === 'routine' ? allow : refuse('Final class is not Routine.'),

  'checking->awaiting_attention': (ctx) =>
    ctx.finalClass === 'authority' || ctx.finalClass === 'uncertainty'
      ? allow
      : refuse('Final class is not Authority or Uncertainty.'),

  'checking->blocked': (ctx) =>
    ctx.finalClass === 'hard_stop' ? allow : refuse('Final class is not Hard stop.'),

  'awaiting_attention->investigating': (ctx) => {
    if (!ctx.actorRole) return refuse('An investigation must be requested by a user.');
    return can(ctx.actorRole, 'request_investigation')
      ? allow
      : refuse('This role may not request an investigation.');
  },

  'investigating->awaiting_attention': (ctx) =>
    ctx.rerunComplete ? allow : refuse('The re-run has not finished.'),

  'awaiting_attention->on_hold': (ctx) =>
    ctx.hold?.awaiting && ctx.hold.owner
      ? allow
      : refuse('A hold must record what is awaited and who owns it.'),

  'on_hold->awaiting_attention': (ctx) =>
    ctx.evidenceReceived ? allow : refuse('The awaited evidence has not been recorded as received.'),

  'blocked->awaiting_attention': (ctx) =>
    ctx.verificationConfirmed
      ? allow
      : refuse('The verification path is not complete and confirmed.'),

  'awaiting_attention->approved': (ctx) => {
    if (!ctx.allGatesCleared) return refuse('Not every gate is cleared.');
    if (!ctx.approval) return refuse('No approval exists.');
    const amount = ctx.amountBaseCents;
    if (amount === undefined) return refuse('The approval amount is unknown.');
    if (!can(ctx.approval.role, 'approve_authority', { amountBaseCents: amount }, ctx.ruleset)) {
      if (ctx.approval.role === 'manager') {
        const limit = managerApprovalLimitCents(ctx.ruleset);
        return refuse(`A Manager may approve up to $${(limit / 100).toLocaleString('en-US')}. This amount needs the CFO.`);
      }
      return refuse('This role may not approve an Authority gate.');
    }
    return allow;
  },

  'awaiting_attention->rejected': (ctx) => {
    if (!ctx.actorRole || ctx.actorRole === 'operator') {
      return refuse('Rejection needs a Manager or the CFO.');
    }
    return ctx.rejectionReason ? allow : refuse('A rejection must record a reason.');
  },

  'ready->payment_scheduled': (ctx) => {
    if (ctx.hardStopGateActive) return refuse('An active hard-stop gate blocks scheduling.');
    return ctx.finalClass === 'routine'
      ? allow
      : refuse('Only a Routine invoice can be scheduled without an approval.');
  },

  'approved->payment_scheduled': (ctx) =>
    ctx.hardStopGateActive ? refuse('An active hard-stop gate blocks scheduling.') : allow,

  'payment_scheduled->checking': (ctx) => {
    if (!ctx.beforePaymentRun) return refuse('The payment run has already executed; open a recovery case instead.');
    return ctx.correction ? allow : refuse('Pulling back a scheduled payment needs a correction record.');
  },

  'payment_scheduled->paid': (ctx) =>
    ctx.paymentRunExecuted ? allow : refuse('The payment run has not executed.'),

  'paid->recovery': (ctx) =>
    ctx.mistakeReported ? allow : refuse('A recovery case opens only when a mistake is reported.'),
};

// Any state before payment -> Checking, with a correction record.
for (const from of CORRECTABLE_STATES) {
  const key = `${from}->checking`;
  if (!(key in TRANSITIONS)) {
    TRANSITIONS[key] = (ctx) =>
      ctx.correction ? allow : refuse('A correction record with its scope is required.');
  }
}

export const INVOICE_STATES: InvoiceState[] = [
  'received',
  'checking',
  'ready',
  'awaiting_attention',
  'investigating',
  'on_hold',
  'blocked',
  'approved',
  'payment_scheduled',
  'paid',
  'rejected',
  'recovery',
];

/**
 * The only place an invoice changes state. Refuses any transition whose guard
 * is not met, and any transition not declared in section 6.
 */
export function attemptTransition(
  from: InvoiceState,
  to: InvoiceState,
  ctx: GuardContext,
): TransitionResult {
  const guard = TRANSITIONS[`${from}->${to}`];
  if (!guard) return refuse(`There is no transition from ${from} to ${to}.`);
  return guard(ctx);
}

/** Declared transitions, for tests and for deriving available actions in the UI. */
export function declaredTransitions(): Array<{ from: InvoiceState; to: InvoiceState }> {
  return Object.keys(TRANSITIONS).map((key) => {
    const [from, to] = key.split('->') as [InvoiceState, InvoiceState];
    return { from, to };
  });
}
