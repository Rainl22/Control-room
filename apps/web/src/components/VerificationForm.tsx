'use client';

import { can, canPerformVerificationStep2, type Supplier, type User, type Verification } from '@control-room/core';
import { useState } from 'react';
import type { ActionResult } from '@/lib/store';

interface Props {
  supplier: Supplier;
  verification?: Verification;
  users: User[];
  currentUser: User;
  onStep1: (spokeTo: string, outcome: 'confirmed' | 'not_confirmed') => ActionResult;
  onStep2: (decision: 'confirmed' | 'rejected') => Promise<ActionResult>;
  onRefusal: (refusal: string) => void;
}

/**
 * The hard-stop verification path (brief section 7), deliberately short:
 * step 1 contacts the supplier using the contact details already on the
 * supplier record — never those printed on the invoice. A different person
 * with the Manager role reviews the record in step 2. The card shows only
 * what the current person can actually do; the guards still enforce it.
 */
export function VerificationForm({ supplier, verification, users, currentUser, onStep1, onStep2, onRefusal }: Props) {
  const [spokeTo, setSpokeTo] = useState('');
  const [outcome, setOutcome] = useState<'confirmed' | 'not_confirmed'>('confirmed');

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const managers = users.filter((u) => u.role === 'manager');

  if (verification?.step2) {
    return (
      <p className="text-[13px] text-ink-muted">
        {verification.step2.outcome === 'confirmed'
          ? `Record confirmed by ${nameOf(verification.step2.userId)}.`
          : `Step-1 record rejected by ${nameOf(verification.step2.userId)}; step 1 must be redone.`}
      </p>
    );
  }

  // --- Step 2: a record is awaiting review ---
  if (verification) {
    const supplierConfirmed = verification.step1.outcome === 'confirmed';
    const eligible = canPerformVerificationStep2(currentUser.role, verification.step1.userId, currentUser.id);
    const isRecorder = verification.step1.userId === currentUser.id;

    return (
      <div className="space-y-3 text-[13px]">
        <div className="rounded-md bg-canvas p-3">
          <p className="font-medium">Step 1 recorded by {nameOf(verification.step1.userId)}</p>
          <p className="mt-1 text-ink-muted">
            Called {verification.step1.contactUsed}, spoke to {verification.step1.spokeTo}. The supplier{' '}
            {supplierConfirmed ? 'confirmed the new details' : 'did NOT confirm the details'}.
          </p>
        </div>

        {eligible ? (
          <>
            <p className="text-ink-muted">
              Step 2: you review that record.{' '}
              {supplierConfirmed
                ? 'Confirming it marks the details verified and returns the invoice for re-evaluation.'
                : 'Confirming it rejects the invoice and flags the supplier — the supplier did not confirm.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const r = await onStep2('confirmed');
                  if (!r.ok) onRefusal(r.refusal);
                }}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  supplierConfirmed ? 'bg-ink text-white' : 'border border-hardstop/40 text-hardstop'
                }`}
              >
                {supplierConfirmed ? 'Confirm — mark details verified' : 'Confirm — reject invoice, flag supplier'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await onStep2('rejected');
                  if (!r.ok) onRefusal(r.refusal);
                }}
                className="rounded-md border border-ink/20 px-3 py-1.5 text-xs"
              >
                Record is wrong — redo step 1
              </button>
            </div>
          </>
        ) : (
          <p className="rounded-md bg-routine-tint px-3 py-2 text-[12px] text-ink-muted">
            {isRecorder
              ? 'You recorded step 1, so you cannot perform step 2 — and with one Manager on the team, this case now waits. That is a deliberate policy choice; the supervision system shows it rather than hides it.'
              : 'Step 2 needs a Manager who did not record step 1. Waiting on ' +
                managers
                  .filter((m) => m.id !== verification.step1.userId)
                  .map((m) => m.name)
                  .join(', ') +
                (managers.every((m) => m.id === verification.step1.userId) ? 'nobody — the only Manager recorded step 1.' : '.')}
          </p>
        )}
      </div>
    );
  }

  // --- Step 1: no record yet ---
  if (!can(currentUser.role, 'verification_step1')) {
    return (
      <p className="rounded-md bg-routine-tint px-3 py-2 text-[12px] text-ink-muted">
        Step 1 is performed by an Operator or a Manager — the CFO does neither verification step. Switch role to
        Dana (Operator) or Marcus (Manager) to record the call.
      </p>
    );
  }

  const soleManagerTrap = currentUser.role === 'manager' && managers.length === 1;

  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-ink-muted">
        Step 1: contact the supplier on the number from the supplier record —{' '}
        <span className="font-mono text-xs text-ink">{supplier.verifiedContact.phone}</span> (
        {supplier.verifiedContact.name}). Never use contact details printed on the invoice.
      </p>
      {soleManagerTrap ? (
        <p className="rounded-md bg-uncertainty-tint px-3 py-2 text-[12px] text-uncertainty">
          You are the only Manager. If you record step 1 yourself, nobody can perform step 2 and this case will
          wait. Consider letting Dana (Operator) make the call instead.
        </p>
      ) : null}
      <input
        className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5"
        placeholder="Who did you speak to?"
        value={spokeTo}
        onChange={(e) => setSpokeTo(e.target.value)}
      />
      <select
        aria-label="Outcome"
        className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as 'confirmed' | 'not_confirmed')}
      >
        <option value="confirmed">Supplier confirmed the new details</option>
        <option value="not_confirmed">Supplier did NOT confirm</option>
      </select>
      <button
        type="button"
        disabled={!spokeTo.trim()}
        onClick={() => {
          const r = onStep1(spokeTo.trim(), outcome);
          if (!r.ok) onRefusal(r.refusal);
        }}
        className="rounded-md bg-ink px-3 py-1.5 text-xs text-white disabled:opacity-40"
      >
        Record step 1
      </button>
    </div>
  );
}
