import type { GateView } from '@/lib/gates';
import { StatusBadge } from './StatusBadge';

/**
 * The gate checklist: every gate with its status, computed from facts.
 * Resolution order is hard stop, then uncertainty, then authority — approval
 * is always last, so nobody signs for something not yet understood.
 */
export function GateChecklist({ gates }: { gates: GateView[] }) {
  if (gates.length === 0) {
    return <p className="text-[13px] text-ink-muted">No gates. This invoice proceeds on its own.</p>;
  }
  return (
    <>
    <p className="mb-3 text-[11px] text-ink-muted">
      Computed from facts — a recorded verification, a resolution, an approval. Nothing here can be ticked by
      hand.
    </p>
    <ol className="space-y-3">
      {gates.map((gate) => (
        <li key={gate.reason.id} className="flex items-start gap-2 text-[13px]">
          <span
            aria-hidden
            className={`mt-0.5 w-10 flex-none text-[10px] font-medium uppercase tracking-wide ${
              gate.status === 'cleared' ? 'text-ink' : 'text-ink-muted/70'
            }`}
          >
            {gate.status === 'cleared' ? '✓ done' : 'open'}
          </span>
          <span>
            <span className="mr-1.5 align-middle">
              <StatusBadge outcomeClass={gate.reason.class} kind={gate.reason.kind} />
            </span>
            <span className="text-ink-muted">
              {gate.reason.source === 'rule' ? (
                <span className="font-mono text-[11px]">{gate.reason.sourceId} · </span>
              ) : (
                <span className="text-[11px]">AI · </span>
              )}
              {gate.reason.description}
            </span>
            {gate.status === 'cleared' && gate.clearedBy ? (
              <span className="mt-0.5 block text-[11px] text-ink-muted">✓ {gate.clearedBy}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
    </>
  );
}
