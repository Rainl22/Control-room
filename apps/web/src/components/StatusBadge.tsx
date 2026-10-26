import { can, type OutcomeClass, type ReasonKind } from '@control-room/core';
import { useCompany } from '@/lib/store';

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

/**
 * `compact` is for dense lists: an Uncertainty pill shows just its kind
 * ("Conflict", "Unavailable"). The triangle and amber tint still carry the class.
 */
export function StatusBadge({
  outcomeClass,
  kind,
  compact = false,
  neutral = false,
}: {
  outcomeClass: OutcomeClass;
  kind?: ReasonKind;
  compact?: boolean;
  /** Describes the class itself (e.g. on a rule), not an action for the viewer. */
  neutral?: boolean;
}) {
  const { company, currentUserId } = useCompany();
  const role = company?.users.find((u) => u.id === currentUserId)?.role;
  // "Your signature" only for roles that can sign at all; others see a neutral label.
  const authorityLabel = !neutral && role && can(role, 'approve_authority', { amountBaseCents: 0 }) ? 'Needs your signature' : 'Needs a signature';
  const shortKind = compact && outcomeClass === 'uncertainty' && kind;
  const kindSuffix = !shortKind && outcomeClass === 'uncertainty' && kind ? ` · ${KIND_LABEL[kind]}` : '';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[outcomeClass]}`}
    >
      <Shape outcomeClass={outcomeClass} />
      {shortKind ? KIND_LABEL[kind as ReasonKind] : outcomeClass === 'authority' ? authorityLabel : LABELS[outcomeClass]}
      {kindSuffix}
    </span>
  );
}
