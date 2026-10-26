/**
 * Shown while the synthetic company is being seeded and the AI jobs are
 * processed in the browser, which takes a few seconds on first load.
 */
export function LoadingState({ label = 'Setting up Harbourline Supply Co.' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-10">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <svg className="h-5 w-5 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span>
          {label}…
          <span className="ml-2 text-[12px] opacity-80">Loading invoices and running the checks.</span>
        </span>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface shadow-card" />
        ))}
      </div>
      <div className="mt-4 space-y-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-card bg-surface shadow-card" />
        ))}
      </div>
    </div>
  );
}
