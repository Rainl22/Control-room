import { usd } from './money';
import type { Role, Rule, Ruleset } from './types';

/**
 * Roles and permissions, docs/BRIEF.md section 8. Enforced here and by the
 * state-machine guards — never in the UI or the prompt.
 */

export type PermittedAction =
  | 'request_investigation'
  | 'place_on_hold'
  | 'correct_invoice'
  | 'report_mistake'
  | 'resolve_uncertainty'
  | 'approve_authority'
  | 'verification_step1'
  | 'verification_step2'
  | 'supplier_scope_correction'
  | 'edit_rule_parameter'
  | 'co_approve_locked_rule'
  | 'review_spot_check'
  | 'file_new_logic'
  | 'work_recovery';

export interface PermissionQuery {
  /** Base-currency amount, for amount-limited actions. */
  amountBaseCents?: number;
  /** For edit_rule_parameter. */
  rule?: Rule;
}

const OPERATOR_RESOLVE_LIMIT_CENTS = usd(10_000);

/** Manager approval limit comes from R11; falls back to the catalogue default. */
export function managerApprovalLimitCents(ruleset?: Ruleset): number {
  const r11 = ruleset?.rules.find((r) => r.id === 'R11');
  const limit = Number(r11?.parameters.managerLimitCents);
  return Number.isFinite(limit) && limit > 0 ? limit : usd(50_000);
}

export function can(role: Role, action: PermittedAction, query: PermissionQuery = {}, ruleset?: Ruleset): boolean {
  switch (action) {
    case 'request_investigation':
    case 'place_on_hold':
    case 'correct_invoice':
    case 'report_mistake':
      return true; // every role

    case 'resolve_uncertainty': {
      if (role === 'manager' || role === 'cfo') return true;
      const amount = query.amountBaseCents ?? Number.POSITIVE_INFINITY;
      return amount <= OPERATOR_RESOLVE_LIMIT_CENTS;
    }

    case 'approve_authority': {
      if (role === 'operator') return false;
      const amount = query.amountBaseCents ?? Number.POSITIVE_INFINITY;
      if (role === 'manager') return amount <= managerApprovalLimitCents(ruleset);
      return true; // cfo: any amount
    }

    case 'verification_step1':
      return role === 'operator' || role === 'manager';

    case 'verification_step2':
      return role === 'manager';

    case 'supplier_scope_correction':
    case 'review_spot_check':
    case 'file_new_logic':
    case 'work_recovery':
      return role === 'manager' || role === 'cfo';

    case 'edit_rule_parameter': {
      const rule = query.rule;
      if (!rule) throw new Error('edit_rule_parameter requires the rule');
      if (rule.locked) return false; // locked rules change only via co-approval
      if (role === 'cfo') return true;
      if (role === 'manager') return rule.editableBy === 'manager_or_cfo';
      return false;
    }

    case 'co_approve_locked_rule':
      return role === 'manager' || role === 'cfo';
  }
}

/**
 * Segregation rules (kept deliberately few):
 * the person who performs verification step 1 cannot perform step 2, and the
 * person who requests a rule change cannot co-approve it.
 */
/**
 * Step 2 is done by a Manager other than the person who did step 1. Only when
 * no such Manager exists may the case be escalated to the CFO, who can then
 * perform step 2 (and never otherwise).
 */
export function canPerformVerificationStep2(
  role: Role,
  step1UserId: string,
  step2UserId: string,
  opts: { escalatedToCfo?: boolean } = {},
): boolean {
  if (step1UserId === step2UserId) return false;
  if (role === 'cfo') return opts.escalatedToCfo === true;
  return can(role, 'verification_step2');
}

/** Managers who could perform step 2: every Manager except the step-1 person. */
export function eligibleStep2Managers<U extends { id: string; role: Role }>(users: U[], step1UserId: string): U[] {
  return users.filter((u) => u.role === 'manager' && u.id !== step1UserId);
}

/** Escalating to the CFO is available only when no other Manager can do step 2. */
export function cfoEscalationAvailable(users: Array<{ id: string; role: Role }>, step1UserId: string): boolean {
  return eligibleStep2Managers(users, step1UserId).length === 0;
}

export function canCoApproveLockedRuleChange(role: Role, requesterUserId: string, coApproverUserId: string): boolean {
  return can(role, 'co_approve_locked_rule') && requesterUserId !== coApproverUserId;
}

/**
 * A locked-rule change needs a Manager and the CFO to co-approve: the two
 * approvers must hold the two distinct roles, and neither may be the requester.
 */
export function lockedRuleChangeApproved(
  requesterUserId: string,
  approvals: Array<{ userId: string; role: Role }>,
): boolean {
  const valid = approvals.filter(
    (a) => a.userId !== requesterUserId && (a.role === 'manager' || a.role === 'cfo'),
  );
  const roles = new Set(valid.map((a) => a.role));
  return roles.has('manager') && roles.has('cfo');
}
