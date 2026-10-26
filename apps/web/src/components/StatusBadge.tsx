import type { OutcomeClass, ReasonKind } from '@control-room/core';

/**
 * Class identity (brief section 12): color means class and only class, and
 * never color alone — every class has its own shape and label.
 */

const KIND_LABEL: Record<ReasonKind, string> = {
  trust: 'Trust',
  conflict: 'Conflict',
  missing: 'Missing',
  unavailable: 'Unavailable',
  signature: 'Signature',
};

function Shape({ outcomeClass }: { outcomeClass: OutcomeClass }) {
  const common = { width: 12, height: 12, 'aria-hidden': true as const };
  switch (outcomeClass) {
    case 'routine': // small solid dot, no hue — reads as a marker, not a radio button
      return (
        <svg {...common} viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'authority': // rounded square
      return (
        <svg {...common} viewBox="0 0 12 12">
          <rect x="1.5" y="1.5" width="9" height="9" rx="2.5" fill="currentColor" />
        </svg>
      );
    case 'uncertainty': // triangle
      return (
        <svg {...common} viewBox="0 0 12 12">
          <path d="M6 1.5 L11 10.5 H1 Z" fill="currentColor" />
        </svg>
      );
    case 'hard_stop': // octagon
      return (
        <svg {...common} viewBox="0 0 12 12">
          <path d="M4 1 h4 l3 3 v4 l-3 3 h-4 l-3 -3 v-4 Z" fill="currentColor" />
        </svg>
      );
  }
}

const STYLES: Record<OutcomeClass, string> = {
  routine: 'bg-routine-tint text-ink-muted',
  authority: 'bg-authority-tint text-authority',
  uncertainty: 'bg-uncertainty-tint text-uncertainty',
  hard_stop: 'bg-hardstop-tint text-hardstop',
};

const LABELS: Record<OutcomeClass, string> = {
  routine: 'Routine',
  authority: 'Needs your signature',
  uncertainty: 'Needs interpretation',
  hard_stop: 'Blocked',
};

export function StatusBadge({ outcomeClass, kind }: { outcomeClass: OutcomeClass; kind?: ReasonKind }) {
  const kindSuffix = outcomeClass === 'uncertainty' && kind ? ` · ${KIND_LABEL[kind]}` : '';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[outcomeClass]}`}
    >
      <Shape outcomeClass={outcomeClass} />
      {LABELS[outcomeClass]}
      {kindSuffix}
    </span>
  );
}
