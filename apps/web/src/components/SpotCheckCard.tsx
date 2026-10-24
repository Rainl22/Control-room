'use client';

import { can } from '@control-room/core';
import Link from 'next/link';
import { useCompany } from '@/lib/store';

/**
 * Phase 2: routine sampling (brief section 15). The AI is interrupted when it
 * is unsure and sampled when it is confident. Managers and the CFO review;
 * Operators do not see the card.
 */
export function SpotCheckCard() {
  const { company, spotChecks, reviews, processed, currentUserId } = useCompany();
  if (!company) return null;
  const user = company.users.find((u) => u.id === currentUserId);
  if (!user || !can(user.role, 'review_spot_check') || spotChecks.length === 0) return null;

  const pending = spotChecks.filter((c) => !c.outcome);
  const confirmed = spotChecks.filter((c) => c.outcome === 'confirmed').length;
  const flagged = spotChecks.filter((c) => c.outcome === 'flagged').length;

  // Verdict summary, with staged examples counted separately — the figures
  // are illustrative, from synthetic data.
  const verdictCounts = { false_alarm: 0, missed: 0, stagedFalseAlarm: 0, stagedMissed: 0 };
  for (const review of reviews) {
    const record = Object.values(processed).find((p) => p.result.aiRun.id === review.aiRunId);
    const staged = record?.result.aiRun.provenance === 'staged';
    if (review.verdict === 'false_alarm') staged ? verdictCounts.stagedFalseAlarm++ : verdictCounts.false_alarm++;
    if (review.verdict === 'missed') staged ? verdictCounts.stagedMissed++ : verdictCounts.missed++;
  }

  return (
    <section className="mb-8 rounded-card bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Routine spot check — this week&apos;s sample</h2>
        <span className="text-xs text-ink-muted">
          {spotChecks.length} sampled · {confirmed} confirmed · {flagged} flagged
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        A random sample of routine decisions that never reached a person. Sampling only observes — it cannot
        change a class or block a payment. Items expire at the end of the week.
      </p>
      {pending.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {pending.map((check) => {
            const invoice = company.invoices.find((i) => i.id === check.invoiceId);
            const supplier = company.suppliers.find((s) => s.id === invoice?.supplierId);
            return (
              <li key={check.id} className="text-[13px]">
                <Link href={`/invoice/${check.invoiceId}`} className="hover:underline">
                  <span className="font-mono text-xs">{invoice?.invoiceNumber}</span> · {supplier?.name} — review
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-muted">All reviewed.</p>
      )}
      {reviews.length > 0 ? (
        <p className="mt-3 border-t border-canvas pt-2 text-xs text-ink-muted">
          AI verdicts so far (illustrative, synthetic data): {verdictCounts.false_alarm} false alarms,{' '}
          {verdictCounts.missed} misses
          {verdictCounts.stagedFalseAlarm + verdictCounts.stagedMissed > 0
            ? ` · staged examples counted separately: ${verdictCounts.stagedFalseAlarm} false alarms, ${verdictCounts.stagedMissed} misses`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
