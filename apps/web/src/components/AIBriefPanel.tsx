import type { AIRun, Evidence } from '@control-room/core';
import { EvidenceList } from './EvidenceChip';
import { RunLabel } from './RunLabel';

const JOB_NAMES: Record<string, string> = {
  J1: 'Near-duplicate',
  J2: 'Mismatch explanation',
  J3: 'Missing-PO search',
  J4: 'Pattern anomaly',
  J5: 'Review brief',
};

const FAILURE_LABELS: Record<string, string> = {
  timeout: 'it took too long',
  error: 'it hit an error',
  schema_invalid: 'its answer was malformed',
  unknown_evidence: 'it cited a source it wasn’t given',
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
  // notice, rendered on a plain surface without the AI accent bar.
  if (run.status === 'failed') {
    return (
      <section className="rounded-card bg-surface p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Why this failed
          </span>
        </div>
        <p className="text-sm text-ink">
          The AI check didn&apos;t finish ({FAILURE_LABELS[run.failureType ?? 'error'] ?? 'unexpected error'}), so
          we&apos;ve held this invoice for a person to review rather than let it through unchecked. Nothing is
          wrong with the invoice itself. The check broke, and that&apos;s noted on the timeline.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border-l-[3px] border-ai bg-surface p-5 shadow-card">
      <div className="mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ai">
          AI analysis · {citedCount} source{citedCount === 1 ? '' : 's'} cited
        </span>
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
                  <EvidenceList ids={finding.evidenceIds} evidenceById={evidenceById} />
                </li>
              ))}
            </ul>
          ) : null}
      </>
      <div className="mt-4 border-t border-ink/10 pt-3">
        <RunLabel run={run} />
      </div>
    </section>
  );
}
