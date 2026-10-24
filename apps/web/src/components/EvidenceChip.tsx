'use client';

import type { Evidence } from '@control-room/core';
import { useState } from 'react';

function shortLabel(id: string): string {
  // ev:po:PO-5598:total -> PO-5598 · total
  const parts = id.split(':');
  return parts.length >= 4 ? `${parts[2]} · ${parts[3]}` : id;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 1);
  return String(value);
}

/**
 * A cited evidence ID, rendered as a chip that opens its source: the entity,
 * field path, the value as it was when read, and when it was read.
 */
export function EvidenceChip({ evidence, id }: { evidence?: Evidence; id: string }) {
  const [open, setOpen] = useState(false);
  if (!evidence) {
    return <span className="rounded bg-hardstop-tint px-1.5 py-0.5 font-mono text-[11px] text-hardstop">{id} (unknown)</span>;
  }
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink shadow-sm ring-1 ring-ink/10 hover:ring-ink/30"
      >
        {shortLabel(evidence.id)}
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-10 mt-1 block w-72 rounded-md bg-ink p-3 text-left text-[11px] leading-relaxed text-white shadow-lg">
          <span className="block font-mono text-[10px] opacity-70">{evidence.id}</span>
          <span className="mt-1 block">
            {evidence.source.entity} <span className="opacity-70">{evidence.source.entityId}</span> ·{' '}
            {evidence.source.fieldPath}
          </span>
          <span className="mt-1 block whitespace-pre-wrap font-mono text-[10px]">{renderValue(evidence.value)}</span>
          <span className="mt-1 block opacity-70">read {evidence.retrievedAt.slice(0, 16).replace('T', ' ')}</span>
        </span>
      ) : null}
    </span>
  );
}
