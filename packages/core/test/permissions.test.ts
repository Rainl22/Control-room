import { describe, expect, it } from 'vitest';
import { usd } from '../src/money';
import {
  can,
  canCoApproveLockedRuleChange,
  canPerformVerificationStep2,
  cfoEscalationAvailable,
  lockedRuleChangeApproved,
} from '../src/permissions';
import { getRule, starterRuleset } from '../src/rules/catalogue';
import type { Role } from '../src/types';

const ROLES: Role[] = ['operator', 'manager', 'cfo'];

describe('permission matrix (brief section 8)', () => {
  it('everyone may request investigation, hold, correct and report', () => {
    for (const role of ROLES) {
      expect(can(role, 'request_investigation')).toBe(true);
      expect(can(role, 'place_on_hold')).toBe(true);
      expect(can(role, 'correct_invoice')).toBe(true);
      expect(can(role, 'report_mistake')).toBe(true);
    }
  });

  it('operators resolve Uncertainty only up to $10,000', () => {
    expect(can('operator', 'resolve_uncertainty', { amountBaseCents: usd(10_000) })).toBe(true);
    expect(can('operator', 'resolve_uncertainty', { amountBaseCents: usd(10_001) })).toBe(false);
    expect(can('manager', 'resolve_uncertainty', { amountBaseCents: usd(60_000) })).toBe(true);
    expect(can('cfo', 'resolve_uncertainty', { amountBaseCents: usd(60_000) })).toBe(true);
  });

  it('approval: operator never, manager to $50,000, CFO any amount', () => {
    expect(can('operator', 'approve_authority', { amountBaseCents: usd(100) })).toBe(false);
    expect(can('manager', 'approve_authority', { amountBaseCents: usd(50_000) })).toBe(true);
    expect(can('manager', 'approve_authority', { amountBaseCents: usd(50_001) })).toBe(false);
    expect(can('cfo', 'approve_authority', { amountBaseCents: usd(500_000) })).toBe(true);
  });

  it('verification: step 1 is Operator/Manager, step 2 Manager only, CFO neither', () => {
    expect(can('operator', 'verification_step1')).toBe(true);
    expect(can('manager', 'verification_step1')).toBe(true);
    expect(can('cfo', 'verification_step1')).toBe(false);
    expect(can('operator', 'verification_step2')).toBe(false);
    expect(can('manager', 'verification_step2')).toBe(true);
    expect(can('cfo', 'verification_step2')).toBe(false);
  });

  it('manager-and-above actions', () => {
    for (const action of ['supplier_scope_correction', 'review_spot_check', 'file_new_logic', 'work_recovery'] as const) {
      expect(can('operator', action)).toBe(false);
      expect(can('manager', action)).toBe(true);
      expect(can('cfo', action)).toBe(true);
    }
  });
});

describe('rule editing', () => {
  const ruleset = starterRuleset();

  it('locked rules (R01-R04) cannot be edited directly by anyone', () => {
    for (const id of ['R01', 'R02', 'R03', 'R04']) {
      for (const role of ROLES) {
        expect(can(role, 'edit_rule_parameter', { rule: getRule(ruleset, id) })).toBe(false);
      }
    }
  });

  it('manager may edit editable rules except R08 and R11; CFO may edit all unlocked', () => {
    expect(can('manager', 'edit_rule_parameter', { rule: getRule(ruleset, 'R05') })).toBe(true);
    expect(can('manager', 'edit_rule_parameter', { rule: getRule(ruleset, 'R08') })).toBe(false);
    expect(can('manager', 'edit_rule_parameter', { rule: getRule(ruleset, 'R11') })).toBe(false);
    expect(can('cfo', 'edit_rule_parameter', { rule: getRule(ruleset, 'R08') })).toBe(true);
    expect(can('cfo', 'edit_rule_parameter', { rule: getRule(ruleset, 'R11') })).toBe(true);
    expect(can('operator', 'edit_rule_parameter', { rule: getRule(ruleset, 'R05') })).toBe(false);
  });
});

describe('segregation rules', () => {
  it('the person who performs verification step 1 cannot perform step 2', () => {
    expect(canPerformVerificationStep2('manager', 'usr_dana', 'usr_marcus')).toBe(true);
    expect(canPerformVerificationStep2('manager', 'usr_marcus', 'usr_marcus')).toBe(false);
  });

  it('with two Managers, the other Manager does step 2 and the recorder cannot', () => {
    expect(canPerformVerificationStep2('manager', 'usr_marcus', 'usr_priya')).toBe(true);
    expect(canPerformVerificationStep2('manager', 'usr_marcus', 'usr_marcus')).toBe(false);
    expect(canPerformVerificationStep2('operator', 'usr_marcus', 'usr_dana')).toBe(false);
  });

  it('the CFO can do step 2 only after an escalation, and escalation exists only with no other Manager', () => {
    const two = [
      { id: 'usr_marcus', role: 'manager' as const },
      { id: 'usr_priya', role: 'manager' as const },
    ];
    const one = [{ id: 'usr_marcus', role: 'manager' as const }];
    expect(cfoEscalationAvailable(two, 'usr_marcus')).toBe(false);
    expect(cfoEscalationAvailable(one, 'usr_marcus')).toBe(true);
    expect(canPerformVerificationStep2('cfo', 'usr_marcus', 'usr_elena')).toBe(false);
    expect(canPerformVerificationStep2('cfo', 'usr_marcus', 'usr_elena', { escalatedToCfo: true })).toBe(true);
  });

  it('the requester of a locked-rule change cannot co-approve it', () => {
    expect(canCoApproveLockedRuleChange('cfo', 'usr_marcus', 'usr_elena')).toBe(true);
    expect(canCoApproveLockedRuleChange('manager', 'usr_marcus', 'usr_marcus')).toBe(false);
  });

  it('a locked-rule change needs Manager + CFO co-approval, excluding the requester', () => {
    expect(
      lockedRuleChangeApproved('usr_dana', [
        { userId: 'usr_marcus', role: 'manager' },
        { userId: 'usr_elena', role: 'cfo' },
      ]),
    ).toBe(true);
    // The requester's own approval does not count.
    expect(
      lockedRuleChangeApproved('usr_marcus', [
        { userId: 'usr_marcus', role: 'manager' },
        { userId: 'usr_elena', role: 'cfo' },
      ]),
    ).toBe(false);
    // Two approvals from the same role are not co-approval.
    expect(
      lockedRuleChangeApproved('usr_dana', [
        { userId: 'usr_elena', role: 'cfo' },
        { userId: 'usr_elena', role: 'cfo' },
      ]),
    ).toBe(false);
  });
});
