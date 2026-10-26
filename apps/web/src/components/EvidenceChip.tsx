'use client';

import type { Evidence } from '@control-room/core';

function shortLabel(id: string): string {
  // ev:po:PO-5598:total -> PO-5598 · total
  const parts = id.split(':');
  return parts.length >= 4 ? `${parts[2]} · ${parts[3]}` : id;
}

/** bank_details_on_invoice / accountNumber -> "Bank details on invoice" / "Account number" */
function humanize(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-muted">—</span>;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return (
      <dl className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-ink-muted">{humanize(k)}</dt>
            <dd className="text-right font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (Array.isArray(value)) return <span className="font-medium">{value.map(String).join(', ')}</span>;
  return <span className="font-medium">{String(value)}</span>;
}

function EvidenceCard({ evidence, id }: { evidence?: Evidence; id: string }) {
  if (!evidence) {
    return (
      <div className="rounded-lg bg-hardstop-tint px-3 py-2 text-[12px] text-hardstop">
        Unknown source <span className="font-mono text-[11px]">{id}</span>
      </div>
    );
  }
  return (
    <details open className="group rounded-lg bg-canvas">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12px] font-medium hover:bg-routine-tint [&::-webkit-details-marker]:hidden">
        <span>
          {evidence.source.entityId} <span className="font-normal text-ink-muted">· {humanize(evidence.source.fieldPath)}</span>
        </span>
        <svg
          className="h-3.5 w-3.5 flex-none text-ink-muted transition-transform group-open:rotate-180"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M3 4.5 L6 7.5 L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-3 pb-3 text-[12px]">
        <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">{evidence.source.entity}</div>
        <Value value={evidence.value} />
        <div className="mt-2 text-[11px] text-ink-muted" title={shortLabel(evidence.id) + ' · ' + evidence.id}>
          Read {evidence.retrievedAt.slice(0, 16).replace('T', ' ')}
        </div>
      </div>
    </details>
  );
}

/**
 * Cited evidence, shown as open-by-default accordions side by side. Each card
 * is the source of one cited ID: the entity, the field, the value as it was
 * when read, and when it was read.
 */
export function EvidenceList({ ids, evidenceById }: { ids: string[]; evidenceById: Map<string, Evidence> }) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
      {ids.map((id) => (
        <EvidenceCard key={id} id={id} evidence={evidenceById.get(id)} />
      ))}
    </div>
  );
}
