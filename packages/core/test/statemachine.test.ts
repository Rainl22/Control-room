import { describe, expect, it } from 'vitest';
import { usd } from '../src/money';
import { attemptTransition, declaredTransitions, INVOICE_STATES } from '../src/statemachine';
import type { GuardContext, InvoiceState } from '../src/index';

function allowed(from: InvoiceState, to: InvoiceState, ctx: GuardContext = {}) {
  return attemptTransition(from, to, ctx);
}

describe('declared transitions, guards satisfied', () => {
  const cases: Array<[InvoiceState, InvoiceState, GuardContext]> = [
    ['received', 'checking', { structurallyValid: true }],
    ['checking', 'ready', { finalClass: 'routine' }],
    ['checking', 'awaiting_attention', { finalClass: 'uncertainty' }],
    ['checking', 'awaiting_attention', { finalClass: 'authority' }],
    ['checking', 'blocked', { finalClass: 'hard_stop' }],
    ['awaiting_attention', 'investigating', { actorRole: 'operator' }],
    ['investigating', 'awaiting_attention', { rerunComplete: true }],
    ['awaiting_attention', 'on_hold', { hold: { awaiting: 'supplier credit note', owner: 'usr_dana' } }],
    ['on_hold', 'awaiting_attention', { evidenceReceived: true }],
    ['blocked', 'awaiting_attention', { verificationConfirmed: true }],
    ['awaiting_attention', 'approved', { allGatesCleared: true, approval: { role: 'manager' }, amountBaseCents: usd(18_000) }],
    ['awaiting_attention', 'approved', { allGatesCleared: true, approval: { role: 'cfo' }, amountBaseCents: usd(60_000) }],
    ['awaiting_attention', 'rejected', { actorRole: 'manager', rejectionReason: 'Not a valid charge.' }],
    ['ready', 'payment_scheduled', { finalClass: 'routine' }],
    ['approved', 'payment_scheduled', {}],
    ['payment_scheduled', 'checking', { beforePaymentRun: true, correction: { scope: 'this_invoice' } }],
    ['payment_scheduled', 'paid', { paymentRunExecuted: true }],
    ['paid', 'recovery', { mistakeReported: true }],
    ['blocked', 'checking', { correction: { scope: 'this_invoice' } }],
    ['approved', 'checking', { correction: { scope: 'this_invoice' } }],
  ];

  for (const [from, to, ctx] of cases) {
    it(`${from} -> ${to}`, () => {
      expect(allowed(from, to, ctx)).toEqual({ allowed: true });
    });
  }
});

describe('declared transitions refuse when the guard is not met', () => {
  const cases: Array<[InvoiceState, InvoiceState, GuardContext, string]> = [
    ['received', 'checking', {}, 'not structurally valid'],
    ['checking', 'ready', { finalClass: 'authority' }, 'only Routine goes Ready'],
    ['checking', 'blocked', { finalClass: 'uncertainty' }, 'only Hard stop goes Blocked'],
    ['awaiting_attention', 'on_hold', {}, 'hold must record what is awaited'],
    ['on_hold', 'awaiting_attention', {}, 'evidence not received'],
    ['blocked', 'awaiting_attention', {}, 'verification incomplete'],
    ['awaiting_attention', 'approved', { approval: { role: 'manager' }, amountBaseCents: usd(18_000) }, 'gates not cleared'],
    ['awaiting_attention', 'approved', { allGatesCleared: true, amountBaseCents: usd(18_000) }, 'no approval'],
    ['awaiting_attention', 'approved', { allGatesCleared: true, approval: { role: 'operator' }, amountBaseCents: usd(100) }, 'operator may not approve'],
    ['awaiting_attention', 'approved', { allGatesCleared: true, approval: { role: 'manager' }, amountBaseCents: usd(50_001) }, 'manager over the R11 limit'],
    ['awaiting_attention', 'rejected', { actorRole: 'operator', rejectionReason: 'x' }, 'operator may not reject'],
    ['awaiting_attention', 'rejected', { actorRole: 'manager' }, 'no reason recorded'],
    ['ready', 'payment_scheduled', { finalClass: 'routine', hardStopGateActive: true }, 'active hard stop'],
    ['approved', 'payment_scheduled', { hardStopGateActive: true }, 'active hard stop'],
    ['payment_scheduled', 'checking', { correction: { scope: 'this_invoice' } }, 'payment run already executed'],
    ['payment_scheduled', 'checking', { beforePaymentRun: true }, 'no correction record'],
    ['payment_scheduled', 'paid', {}, 'run not executed'],
    ['paid', 'recovery', {}, 'no mistake reported'],
    ['blocked', 'checking', {}, 'no correction record'],
  ];

  for (const [from, to, ctx, label] of cases) {
    it(`${from} -> ${to} (${label})`, () => {
      const result = allowed(from, to, ctx);
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.refusal.length).toBeGreaterThan(0);
    });
  }
});

describe('undeclared transitions are always refused', () => {
  it('refuses every state pair not in section 6, whatever the context', () => {
    const declared = new Set(declaredTransitions().map((t) => `${t.from}->${t.to}`));
    const permissiveCtx: GuardContext = {
      finalClass: 'routine',
      structurallyValid: true,
      actorRole: 'cfo',
      amountBaseCents: usd(1),
      approval: { role: 'cfo' },
      allGatesCleared: true,
      hold: { awaiting: 'x', owner: 'y' },
      evidenceReceived: true,
      verificationConfirmed: true,
      rerunComplete: true,
      correction: { scope: 'this_invoice' },
      rejectionReason: 'x',
      beforePaymentRun: true,
      paymentRunExecuted: true,
      mistakeReported: true,
    };
    let refused = 0;
    for (const from of INVOICE_STATES) {
      for (const to of INVOICE_STATES) {
        if (from === to || declared.has(`${from}->${to}`)) continue;
        const result = attemptTransition(from, to, permissiveCtx);
        expect(result.allowed, `${from} -> ${to} must be refused`).toBe(false);
        refused++;
      }
    }
    expect(refused).toBeGreaterThan(90);
  });

  it('money that has moved cannot be pulled back: paid -> checking is refused', () => {
    const result = attemptTransition('paid', 'checking', { correction: { scope: 'this_invoice' } });
    expect(result.allowed).toBe(false);
  });

  it('rejected is terminal', () => {
    for (const to of INVOICE_STATES) {
      if (to === 'rejected') continue;
      expect(attemptTransition('rejected', to, { correction: { scope: 'this_invoice' } }).allowed).toBe(false);
    }
  });
});

describe('approval covers the amount AND the rules triggered', () => {
  it('an uncertainty-only invoice can be released by an Operator within $10,000', () => {
    const result = attemptTransition('awaiting_attention', 'approved', {
      allGatesCleared: true,
      approval: { role: 'operator' },
      amountBaseCents: usd(1_860),
      requiresSignature: false,
    });
    expect(result).toEqual({ allowed: true });
  });

  it('an Operator may not release an uncertainty-only invoice above $10,000', () => {
    const result = attemptTransition('awaiting_attention', 'approved', {
      allGatesCleared: true,
      approval: { role: 'operator' },
      amountBaseCents: usd(10_001),
      requiresSignature: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('a signature gate always takes approval limits, whatever the amount', () => {
    const result = attemptTransition('awaiting_attention', 'approved', {
      allGatesCleared: true,
      approval: { role: 'operator' },
      amountBaseCents: usd(100),
      requiresSignature: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('defaults to the stricter signature limits when unspecified', () => {
    const result = attemptTransition('awaiting_attention', 'approved', {
      allGatesCleared: true,
      approval: { role: 'operator' },
      amountBaseCents: usd(100),
    });
    expect(result.allowed).toBe(false);
  });
});

describe('failed verification rejects the blocked invoice (section 7)', () => {
  it('blocked -> rejected when verification is not confirmed, by a Manager with a reason', () => {
    expect(
      attemptTransition('blocked', 'rejected', {
        verificationNotConfirmed: true,
        actorRole: 'manager',
        rejectionReason: 'Supplier could not confirm the new account.',
      }),
    ).toEqual({ allowed: true });
  });

  it('refuses without the failed verification, a reason, or a sufficient role', () => {
    expect(attemptTransition('blocked', 'rejected', { actorRole: 'manager', rejectionReason: 'x' }).allowed).toBe(false);
    expect(attemptTransition('blocked', 'rejected', { verificationNotConfirmed: true, actorRole: 'operator', rejectionReason: 'x' }).allowed).toBe(false);
    expect(attemptTransition('blocked', 'rejected', { verificationNotConfirmed: true, actorRole: 'manager' }).allowed).toBe(false);
  });
});
