'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Evidence } from '@control-room/core';
import { AIBriefPanel } from '@/components/AIBriefPanel';
import { EvidenceList } from '@/components/EvidenceChip';
import { GateChecklist } from '@/components/GateChecklist';
import { GuardRefusal } from '@/components/GuardRefusal';
import { Header } from '@/components/Header';
import { LoadingState } from '@/components/LoadingState';
import { StatusBadge } from '@/components/StatusBadge';
import { VerificationForm } from '@/components/VerificationForm';
import { deriveGates, hasSignatureGate, nonSignatureGatesCleared } from '@/lib/gates';
import { attentionRows } from '@/lib/queue';
import { formatBase, formatCents, formatDate } from '@/lib/format';
import { useCompany } from '@/lib/store';

/**
 * Lifecycle states worth a pill of their own. awaiting_attention and blocked
 * are omitted: the class badge already says it, and two pills reading
 * "Blocked" is one too many.
 */
const STATE_LABELS: Record<string, string> = {
  ready: 'Proceeding on its own',
  payment_scheduled: 'Payment scheduled',
  paid: 'Paid (simulated)',
  rejected: 'Rejected',
  recovery: 'In recovery',
  on_hold: 'On hold',
  investigating: 'Investigating',
};

export default function InvoiceReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useCompany();
  const { company, processed, decisions, verifications, recoveryCases, spotChecks, audit, currentUserId, displayCurrency, init } = store;
  const [note, setNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [mistakeNote, setMistakeNote] = useState('');
  const [refusal, setRefusal] = useState('');
  const [resolvingReasonId, setResolvingReasonId] = useState<string | null>(null);
  const [offerFact, setOfferFact] = useState(false);
  const [factText, setFactText] = useState('');

  useEffect(() => {
    void init();
  }, [init]);

  const record = processed[id];
  const invoice = company?.invoices.find((i) => i.id === id);

  const evidenceById = useMemo(() => {
    const map = new Map<string, Evidence>();
    for (const e of record?.result.context.evidence ?? []) map.set(e.id, e);
    return map;
  }, [record]);

  if (!company || !invoice) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Header />
        {!company ? <LoadingState label="Loading this invoice" /> : <p className="text-ink-muted">Invoice not found.</p>}
      </main>
    );
  }

  const supplier = company.suppliers.find((s) => s.id === invoice.supplierId);
  const user = company.users.find((u) => u.id === currentUserId);
  const result = record?.result;
  const reasons = result?.merge.reasons ?? [];
  const gates = deriveGates(reasons, {
    decisions: decisions.filter((d) => d.invoiceId === id),
    verifications: verifications.filter((v) => v.invoiceId === id),
    approved: invoice.state === 'approved' || invoice.state === 'payment_scheduled' || invoice.state === 'paid',
  });
  const openUncertainty = gates.filter((g) => g.reason.class === 'uncertainty' && g.status === 'open');
  const readyToRelease = nonSignatureGatesCleared(gates) && invoice.state === 'awaiting_attention';
  const signature = hasSignatureGate(gates);

  // Consequence of paying: funding account and balance after scheduled payments.
  const account = company.paymentAccounts.find((a) => a.id === supplier?.fundingAccountId);
  const scheduledOnAccount = company.payments
    .filter((p) => p.fundingAccountId === account?.id && p.status === 'scheduled')
    .reduce((sum, p) => sum + p.amountCents, 0);
  const alreadyScheduled = company.payments.some((p) => p.invoiceId === id && p.status === 'scheduled');
  const balanceAfter = account
    ? account.balanceCents - scheduledOnAccount - (alreadyScheduled ? 0 : invoice.totalBaseCents)
    : 0;

  const firedRules = (result?.ruleResults ?? []).filter((r) => r.fired);
  const invoiceAudit = audit.filter((a) => a.invoiceId === id);

  // Position in the attention queue (smart order), for prev/next navigation.
  const queueRows = attentionRows(company.invoices, processed);
  const queueIndex = queueRows.findIndex((r) => r.invoice.id === id);
  const queuePosition =
    queueIndex >= 0
      ? {
          index: queueIndex,
          total: queueRows.length,
          prevId: queueRows[queueIndex - 1]?.invoice.id ?? null,
          nextId: queueRows[queueIndex + 1]?.invoice.id ?? null,
        }
      : null;

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/queue');
  };

  const act = (fn: () => { ok: boolean; refusal?: string }) => {
    setRefusal('');
    const outcome = fn();
    if (!outcome.ok && outcome.refusal) setRefusal(outcome.refusal);
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Header />

      <div className="mb-2 flex items-center justify-between text-xs">
        <button type="button" onClick={goBack} className="text-ink-muted hover:text-ink">
          Back
        </button>
        {queuePosition ? (
          <span className="flex items-center gap-2 text-ink-muted">
            {queuePosition.index + 1} of {queuePosition.total} needing attention
            {queuePosition.prevId ? (
              <Link href={`/invoice/${queuePosition.prevId}`} className="rounded-md border border-ink/15 px-2 py-0.5 hover:border-ink/40">
                ← Prev
              </Link>
            ) : null}
            {queuePosition.nextId ? (
              <Link href={`/invoice/${queuePosition.nextId}`} className="rounded-md border border-ink/15 px-2 py-0.5 hover:border-ink/40">
                Next →
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg">{invoice.invoiceNumber}</h1>
        {result ? <StatusBadge outcomeClass={result.merge.finalClass} /> : null}
        <span className="text-sm text-ink-muted">{supplier?.name}</span>
        <span className="font-display text-lg font-semibold">
          {formatBase(invoice.totalBaseCents, displayCurrency, company.settings)}
        </span>
        <span className="text-sm text-ink-muted">due {formatDate(invoice.dueDate)}</span>
        {STATE_LABELS[invoice.state] ? (
          <span className="ml-auto rounded-full bg-routine-tint px-2.5 py-1 text-xs text-ink-muted">
            {STATE_LABELS[invoice.state]}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {result ? <AIBriefPanel run={result.aiRun} evidenceById={evidenceById} /> : null}

          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-sm font-medium">Rule results</h2>
            {firedRules.length === 0 ? (
              <p className="text-[13px] text-ink-muted">No rule fired.</p>
            ) : (
              <ul className="space-y-2">
                {firedRules.map((r) => {
                  const rule = company.ruleset.rules.find((rule) => rule.id === r.ruleId);
                  return (
                    <li key={r.ruleId} className="text-[13px]">
                      <span className="font-mono text-[11px]">{r.ruleId}</span>{' '}
                      <span className="text-ink-muted">v{r.ruleVersion}</span> · {rule?.statement}
                      <EvidenceList ids={r.evidenceIds} evidenceById={evidenceById} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-sm font-medium">Extracted record</h2>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="pb-1 font-medium">Line</th>
                  <th className="pb-1 text-right font-medium">Qty</th>
                  <th className="pb-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-t border-canvas">
                    <td className="py-1.5">{line.description}</td>
                    <td className="py-1.5 text-right">{line.quantity}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{formatCents(line.amountCents, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-canvas pt-3 text-[13px]">
              <dt className="text-ink-muted">PO reference</dt>
              <dd className="font-mono text-xs">{invoice.poReference ?? '—'}</dd>
              <dt className="text-ink-muted">Bank account on invoice</dt>
              <dd className="font-mono text-xs">{invoice.bankDetailsOnInvoice.accountNumber}</dd>
              <dt className="text-ink-muted">Extractor confidence</dt>
              <dd>{invoice.extractorConfidence}%</dd>
              <dt className="text-ink-muted">Issued</dt>
              <dd>{formatDate(invoice.issueDate)}</dd>
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-sm font-medium">What's holding this up</h2>
            <GateChecklist gates={gates} />
          </section>

          {supplier ? (
            <section className="rounded-card bg-surface p-5 shadow-card">
              <h2 className="mb-2 text-sm font-medium">Supplier</h2>
              <p className="text-[13px]">
                {supplier.name}{' '}
                <span className="text-[11px] text-ink-muted">· {supplier.status} · {supplier.paymentTermsDays}-day terms</span>
              </p>
              {supplier.facts.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {supplier.facts.map((fact) => (
                    <li key={fact.id} className="text-[12px] text-ink-muted">
                      “{fact.text}” — {company.users.find((u) => u.id === fact.setBy)?.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-sm font-medium">Payment impact</h2>
            <p className="text-[13px] text-ink-muted">
              Pays from <span className="text-ink">{account?.name} ···{account?.last4}</span>.
              <br />
              Balance after scheduled payments:{' '}
              <span className={`font-mono text-xs ${balanceAfter < (account?.minimumBalanceCents ?? 0) ? 'text-hardstop' : 'text-ink'}`}>
                {formatBase(balanceAfter, displayCurrency, company.settings)}
              </span>
            </p>
          </section>

          {invoice.state === 'awaiting_attention' || invoice.state === 'blocked' ? (
            <section className="rounded-card bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-sm font-medium">Actions — acting as {user?.name}</h2>

              {invoice.state === 'blocked' && supplier ? (
                <div className="mb-3">
                  <p className="mb-2 text-[13px] text-ink-muted">
                    Payment is blocked. Approval alone cannot clear this — the verification path must be
                    completed first.
                  </p>
                  <VerificationForm
                    supplier={supplier}
                    verification={verifications.find((v) => v.invoiceId === id && !v.step2)}
                    users={company.users}
                    currentUser={user!}
                    onStep1={(spokeTo, outcome) => store.recordVerificationStep1(id, spokeTo, outcome)}
                    onStep2={(decision) => store.recordVerificationStep2(id, decision)}
                    onRefusal={setRefusal}
                  />
                </div>
              ) : null}

              {openUncertainty.map((gate) => (
                <div key={gate.reason.id} className="mb-3 rounded-md bg-canvas p-3">
                  <p className="text-[13px]">{gate.reason.description}</p>
                  {resolvingReasonId === gate.reason.id ? (
                    <div className="mt-2 space-y-2">
                      <input
                        autoFocus
                        className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5 text-[13px]"
                        placeholder="What did you decide, and why?"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!note.trim()}
                          onClick={() => {
                            const isAI = gate.reason.source === 'ai';
                            act(() => store.resolveReason(id, gate.reason.id, note.trim(), isAI));
                            if (isAI) setOfferFact(true);
                            setResolvingReasonId(null);
                          }}
                          className="rounded-md bg-ink px-3 py-1.5 text-xs text-white disabled:opacity-40"
                        >
                          {gate.reason.source === 'ai' ? 'Dismiss — false alarm' : 'Accept with note'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResolvingReasonId(null)}
                          className="rounded-md px-3 py-1.5 text-xs text-ink-muted"
                        >
                          Cancel
                        </button>
                      </div>
                      {gate.reason.source === 'ai' ? (
                        <p className="text-[11px] text-ink-muted">
                          Dismissing records a “false alarm” verdict on the AI run. The run itself is never edited.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNote('');
                        setResolvingReasonId(gate.reason.id);
                      }}
                      className="mt-2 rounded-md border border-ink/20 px-3 py-1.5 text-xs hover:border-ink/50"
                    >
                      Resolve…
                    </button>
                  )}
                </div>
              ))}

              {offerFact ? (
                <div className="mb-3 rounded-md bg-ai-surface p-3">
                  <p className="text-[12px] text-ink-muted">
                    Stop this repeating: record a supplier fact (Manager or CFO). It enters the context on every
                    future evaluation, labelled with who set it and when — nothing is learned silently.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5 text-[13px]"
                      placeholder="e.g. Bills monthly at a fixed amount with distinct invoice numbers"
                      value={factText}
                      onChange={(e) => setFactText(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!factText.trim()}
                      onClick={() => {
                        setRefusal('');
                        const r = store.addSupplierFact(id, factText.trim());
                        if (r.ok) setOfferFact(false);
                        else setRefusal(r.refusal);
                      }}
                      className="whitespace-nowrap rounded-md bg-ink px-3 py-1.5 text-xs text-white disabled:opacity-40"
                    >
                      Add fact
                    </button>
                    <button type="button" onClick={() => setOfferFact(false)} className="px-2 text-xs text-ink-muted">
                      Skip
                    </button>
                  </div>
                </div>
              ) : null}

              {invoice.state === 'awaiting_attention' ? (
                <div className="space-y-2 border-t border-canvas pt-3">
                  <button
                    type="button"
                    onClick={() => act(() => store.approve(id))}
                    disabled={!readyToRelease}
                    className="w-full rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-40"
                  >
                    {signature ? 'Approve & schedule payment' : 'Release & schedule payment'}
                  </button>
                  {!readyToRelease ? (
                    <p className="text-[11px] text-ink-muted">
                      Approval is always last: every other gate must be cleared first.
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <input
                      className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5 text-[13px]"
                      placeholder="Rejection reason"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!rejectNote.trim()}
                      onClick={() => act(() => store.reject(id, rejectNote.trim()))}
                      className="rounded-md border border-hardstop/40 px-3 py-1.5 text-xs text-hardstop disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}

              {refusal ? (
                <div className="mt-3">
                  <GuardRefusal refusal={refusal} />
                </div>
              ) : null}
            </section>
          ) : null}

          {(() => {
            const check = spotChecks.find((c) => c.invoiceId === id && !c.outcome);
            const canReview = user && ['manager', 'cfo'].includes(user.role);
            if (!check || !canReview) return null;
            return (
              <section className="rounded-card bg-surface p-5 shadow-card">
                <h2 className="mb-2 text-sm font-medium">Spot check</h2>
                <p className="mb-2 text-[12px] text-ink-muted">
                  This Routine decision was drawn in this week&apos;s sample. Review the brief and evidence,
                  then confirm or flag. Flagging opens the correction flow and records a &ldquo;missed&rdquo;
                  verdict on the AI run.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => act(() => store.spotCheckConfirm(id))}
                    className="rounded-md bg-ink px-3 py-1.5 text-xs text-white"
                  >
                    Confirm — looks right
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5 text-[13px]"
                    placeholder="What is wrong?"
                    value={mistakeNote}
                    onChange={(e) => setMistakeNote(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!mistakeNote.trim()}
                    onClick={async () => {
                      setRefusal('');
                      const r = await store.spotCheckFlag(id, mistakeNote.trim());
                      if (!r.ok) setRefusal(r.refusal);
                    }}
                    className="whitespace-nowrap rounded-md border border-hardstop/40 px-3 py-1.5 text-xs text-hardstop disabled:opacity-40"
                  >
                    Flag
                  </button>
                </div>
                {refusal ? (
                  <div className="mt-3">
                    <GuardRefusal refusal={refusal} />
                  </div>
                ) : null}
              </section>
            );
          })()}

          {['ready', 'payment_scheduled', 'paid'].includes(invoice.state) ? (
            <section className="rounded-card bg-surface p-5 shadow-card">
              <h2 className="mb-2 text-sm font-medium">Something wrong?</h2>
              <p className="mb-2 text-[12px] text-ink-muted">
                {invoice.state === 'paid'
                  ? 'This invoice has been paid. A mistake cannot be undone — reporting it opens a recovery case.'
                  : 'Reporting a mistake pulls this invoice back before the payment run and re-runs the checks.'}
              </p>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-md border border-routine-tint bg-surface px-2 py-1.5 text-[13px]"
                  placeholder="What is wrong?"
                  value={mistakeNote}
                  onChange={(e) => setMistakeNote(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!mistakeNote.trim()}
                  onClick={async () => {
                    setRefusal('');
                    const r = await store.reportMistake(id, mistakeNote.trim());
                    if (!r.ok) setRefusal(r.refusal);
                  }}
                  className="whitespace-nowrap rounded-md border border-ink/20 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Report a mistake
                </button>
              </div>
              {refusal ? (
                <div className="mt-3">
                  <GuardRefusal refusal={refusal} />
                </div>
              ) : null}
            </section>
          ) : null}

          {recoveryCases
            .filter((c) => c.invoiceId === id)
            .map((recovery) => (
              <section key={recovery.id} className="rounded-card bg-surface p-5 shadow-card">
                <h2 className="mb-2 text-sm font-medium">Recovery case</h2>
                <p className="text-[12px] text-ink-muted">
                  {formatBase(recovery.amountCents, displayCurrency, company.settings)} was paid and cannot be
                  pulled back. Cause: {recovery.cause}
                </p>
                <ul className="mt-3 space-y-2">
                  {recovery.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={step.done}
                        onChange={() => {
                          setRefusal('');
                          const r = store.toggleRecoveryStep(recovery.id, i);
                          if (!r.ok) setRefusal(r.refusal);
                        }}
                        className="mt-0.5"
                      />
                      <span className={step.done ? 'text-ink-muted line-through' : ''}>
                        {step.action}
                        <span className="ml-1 text-[11px] text-ink-muted">
                          · {company.users.find((u) => u.id === step.ownerId)?.name}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {refusal ? (
                  <div className="mt-3">
                    <GuardRefusal refusal={refusal} />
                  </div>
                ) : null}
              </section>
            ))}

          {invoiceAudit.length > 0 ? (
            <section className="rounded-card bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-sm font-medium">Activity</h2>
              <ol className="space-y-2">
                {invoiceAudit.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-ink/60 pl-2 text-[12px] text-ink-muted">
                    <span className="text-ink">{entry.actor === 'system' ? 'System' : company.users.find((u) => u.id === entry.actorId)?.name ?? 'User'}</span>{' '}
                    · {entry.event}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
