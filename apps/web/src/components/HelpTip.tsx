'use client';

import { useId, useState } from 'react';

/**
 * A small "?" that explains itself on hover, keyboard focus or tap. Keep the
 * copy to a couple of sentences.
 */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-muted/50 text-[10px] font-semibold leading-none text-ink-muted hover:border-ink hover:text-ink"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-lg bg-ink p-3 text-left text-[12px] font-normal leading-relaxed text-white shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
