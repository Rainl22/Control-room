import type { AIRun } from '@control-room/core';

/**
 * Every AI result carries its provenance (brief section 4): Live, Recorded
 * run (date, model) or Staged example. Neutral styling — color means class,
 * and only class.
 */
export function RunLabel({ run }: { run: AIRun }) {
  const label =
    run.provenance === 'live'
      ? 'Live'
      : run.provenance === 'recorded'
        ? `Recorded run · ${run.createdAt.slice(0, 10)} · ${run.model}`
        : 'Staged example';
  const staged = run.provenance === 'staged';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-muted" />
      {label}
      {staged ? <span className="text-ink-muted">· written for this demo, not a model run</span> : null}
    </span>
  );
}
