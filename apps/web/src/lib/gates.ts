import {
  gatesInResolutionOrder,
  type Decision,
  type GateStatus,
  type Reason,
  type Verification,
} from '@control-room/core';

/**
 * Gates are derived, never ticked (brief section 3). The system computes
 * whether each one is cleared from recorded facts: a resolution decision, a
 * confirmed verification, an approval. Nobody can tick a box.
 */

export interface GateView {
  reason: Reason;
  status: GateStatus;
  /** Human description of the fact that cleared it. */
  clearedBy?: string;
}

export interface GateFacts {
  decisions: Decision[];
  verifications: Verification[];
  approved: boolean;
}

export function resolveActionId(reasonId: string): string {
  return `resolve:${reasonId}`;
}

export function deriveGates(reasons: Reason[], facts: GateFacts): GateView[] {
  return gatesInResolutionOrder(reasons).map((reason) => {
    if (reason.class === 'hard_stop') {
      const verification = facts.verifications.find((v) => v.step2?.outcome === 'confirmed');
      return verification
        ? { reason, status: 'cleared' as const, clearedBy: 'Verification confirmed by a second person' }
        : { reason, status: 'open' as const };
    }
    if (reason.class === 'uncertainty') {
      const decision = facts.decisions.find((d) => d.action === resolveActionId(reason.id));
      return decision
        ? { reason, status: 'cleared' as const, clearedBy: `Resolved: ${decision.reasonText}` }
        : { reason, status: 'open' as const };
    }
    // Authority: cleared only by the approval itself, always last.
    return facts.approved
      ? { reason, status: 'cleared' as const, clearedBy: 'Approved' }
      : { reason, status: 'open' as const };
  });
}

export function nonSignatureGatesCleared(gates: GateView[]): boolean {
  return gates.filter((g) => g.reason.class !== 'authority').every((g) => g.status === 'cleared');
}

export function hasSignatureGate(gates: GateView[]): boolean {
  return gates.some((g) => g.reason.class === 'authority');
}

export function hardStopActive(gates: GateView[]): boolean {
  return gates.some((g) => g.reason.class === 'hard_stop' && g.status === 'open');
}
