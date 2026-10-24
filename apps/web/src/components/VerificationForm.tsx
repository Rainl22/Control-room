'use client';

import type { Supplier, User, Verification } from '@control-room/core';
import { useState } from 'react';
import type { ActionResult } from '@/lib/store';

interface Props {
  supplier: Supplier;
  verification?: Verification;
  users: User[];
  onStep1: (spokeTo: string, outcome: 'confirmed' | 'not_confirmed') => ActionResult;
  onStep2: (outcome: 'confirmed' | 'rejected') => Promise<ActionResult>;
  onRefusal: (refusal: string) => void;
}

/**
 * The hard-stop verification path (brief section 7), deliberately short:
 * step 1 contacts the supplier using the contact details already on the
 * supplier record — never those printed on the invoice. A different person
 * with the Manager role confirms in step 2.
 */
export function VerificationForm({ supplier, verification, users, onStep1, onStep2, onRefusal }: Props) {
  const [spokeTo, setSpokeTo] = useState('');
  const [outcome, setOutcome] = useState<'confirmed' | 'not_confirmed'>('confirmed');

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  if (verification?.step2) {
    return (
      <p className="text-[13px] text-ink-muted">
        Verification {verification.step2.outcome === 'confirmed' ? 'confirmed' : 'rejected'} by{' '}
        {nameOf(verification.step2.userId)}.
      </p>
    );
  }

  if (verification) {
    return (
      <div className="space-y-3 text-[13px]">
        <div className="rounded-md bg-canvas p-3">
          <p className="font-medium">Step 1 recorded by {nameOf(verification.step1.userId)}</p>
          <p className="mt-1 text-ink-muted">
            Called {verification.step1.contactUsed}, spoke to {verification.step1.spokeTo}. Outcome:{' '}
            {verification.step1.outcome.replace('_', ' ')}.
          </p>
        </div>
        <p className="text-ink-muted">
          Step 2: a different person with the Manager role reviews this record and confirms or rejects it.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              const r = await onStep2('confirmed');
              if (!r.ok) onRefusal(r.refusal);
            }}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-white"
          >
            Confirm verification
          </button>
          <button
            type="button"
            onClick={async () => {
              const r = await onStep2('rejected');
              if (!r.ok) onRefusal(r.refusal);
            }}
            className="rounded-md border border-hardstop/40 px-3 py-1.5 text-xs text-hardstop"
          >
            Reject — not confirmed
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-ink-muted">
        Step 1: contact the supplier on the number from the supplier record —{' '}
        <span className="font-mono text-xs text-ink">{supplier.verifiedContact.phone}</span> (
        {supplier.verifiedContact.name}). Never use contact details printed on the invoice.
      </p>
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
