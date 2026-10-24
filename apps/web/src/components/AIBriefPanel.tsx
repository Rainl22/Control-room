import type { AIRun, Evidence } from '@control-room/core';
import { EvidenceChip } from './EvidenceChip';
import { RunLabel } from './RunLabel';

const JOB_NAMES: Record<string, string> = {
  J1: 'Near-duplicate',
  J2: 'Mismatch explanation',
  J3: 'Missing-PO search',
  J4: 'Pattern anomaly',
  J5: 'Review brief',
};

const ASSESSMENT_LABELS: Record<string, string> = {
  supports: 'supports proceeding',
  contradicts: 'contradicts proceeding',
  unclear: 'unclear',
};

/**
 * AI-written content: warm sand panel, dotted left edge, provenance label and
 * a cited-sources count (brief section 12). A failed run shows the failure,
 * not an empty brief — technical failure is logged at once.
 */
export function AIBriefPanel({ run, evidenceById }: { run: AIRun; evidenceById: Map<string, Evidence> }) {
  const citedCount = run.output ? new Set(run.output.findings.flatMap((f) => f.evidenceIds)).size : 0;

  // A failed run produced no AI-written content: what follows is a system
  // notice, rendered on a plain surface, not on the AI's sand panel.
  if (run.status === 'failed') {
    return (
      <section className="rounded-card bg-surface p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            System · AI run failed
          </span>
          <RunLabel run={run} />
        </div>
        <p className="text-sm text-ink">
          The AI analysis could not be completed ({run.failureType}). The invoice fails closed to Uncertainty
          (Unavailable) and a person must review. This is a technical failure, logged at once on the timeline —
          not a judgment.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border-l-2 border-dotted border-ink-muted/40 bg-ai-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          AI-written · cites {citedCount} source{citedCount === 1 ? '' : 's'}
        </span>
        <RunLabel run={run} />
      </div>

      <>
          <p className="text-sm leading-relaxed">{run.output?.brief}</p>
          {run.output && run.output.findings.length > 0 ? (
            <ul className="mt-4 space-y-3 border-t border-ink/10 pt-3">
              {run.output.findings.map((finding, i) => (
                <li key={i} className="text-[13px]">
                  <span className="font-medium">
                    {JOB_NAMES[finding.job] ?? finding.job}
                  </span>{' '}
                  <span className="text-ink-muted">· {ASSESSMENT_LABELS[finding.assessment]}</span>
                  <p className="mt-0.5 text-ink-muted">{finding.description}</p>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {finding.evidenceIds.map((id) => (
                      <EvidenceChip key={id} id={id} evidence={evidenceById.get(id)} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
      </>
    </section>
  );
}
