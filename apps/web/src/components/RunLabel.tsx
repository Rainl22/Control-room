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
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-muted/30 px-2 py-0.5 text-[11px] text-ink-muted">
      {label}
    </span>
  );
}
