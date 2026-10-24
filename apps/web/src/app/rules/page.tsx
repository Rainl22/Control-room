'use client';

import {
  can,
  replayRuleChange,
  toContextSources,
  usd,
  type ReplayPreview,
  type Rule,
} from '@control-room/core';
import { useEffect, useState } from 'react';
import { GuardRefusal } from '@/components/GuardRefusal';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCents } from '@/lib/format';
import { useCompany } from '@/lib/store';

/** Which parameters are shown and how they are entered, per rule. */
const PARAM_CONFIG: Record<string, Array<{ key: string; label: string; unit: 'usd' | 'pct' }>> = {
  R05: [
    { key: 'tolerancePct', label: 'Tolerance', unit: 'pct' },
    { key: 'toleranceAbsCents', label: 'or at least', unit: 'usd' },
  ],
  R06: [{ key: 'poRequiredAboveCents', label: 'PO required above', unit: 'usd' }],
  R07: [{ key: 'minConfidence', label: 'Minimum extractor confidence', unit: 'pct' }],
  R08: [{ key: 'thresholdCents', label: 'Approval threshold', unit: 'usd' }],
  R11: [{ key: 'managerLimitCents', label: 'Manager approval limit', unit: 'usd' }],
};

function paramDisplay(rule: Rule): string {
  const config = PARAM_CONFIG[rule.id];
  if (config) {
    return config
      .map((c) => `${c.label}: ${c.unit === 'usd' ? formatCents(Number(rule.parameters[c.key]), 'USD') : `${rule.parameters[c.key]}%`}`)
      .join(' · ');
  }
  if (rule.id === 'R09') return `Allowed: ${(rule.parameters.allowedCurrencies as string[]).join(', ')}`;
  if (rule.id === 'R10') return `Home country: ${rule.parameters.homeCountry}`;
  if (rule.id === 'R12') return 'Documented only, not built';
  return '—';
}

function RuleCard({ rule }: { rule: Rule }) {
  const store = useCompany();
  const { company, currentUserId, ruleHistory } = store;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<ReplayPreview | null>(null);
  const [refusal, setRefusal] = useState('');

  const user = company!.users.find((u) => u.id === currentUserId)!;
  const config = PARAM_CONFIG[rule.id];
  const editable = !rule.locked && !!config && rule.id !== 'R12' && can(user.role, 'edit_rule_parameter', { rule });
  const history = ruleHistory.filter((h) => h.ruleId === rule.id);

  const startEditing = () => {
    const initial: Record<string, number> = {};
    for (const c of config ?? []) {
      const raw = Number(rule.parameters[c.key]);
      initial[c.key] = c.unit === 'usd' ? raw / 100 : raw;
    }
    setDraft(initial);
    setPreview(null);
    setRefusal('');
    setEditing(true);
  };

  const draftParams = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    for (const c of config ?? []) {
      params[c.key] = c.unit === 'usd' ? usd(draft[c.key] ?? 0) : draft[c.key];
    }
    return params;
  };

  const runPreview = () => {
    setPreview(replayRuleChange(toContextSources(company!), company!.ruleset, rule.id, draftParams(), new Date().toISOString()));
  };

  const save = () => {
    setRefusal('');
    const result = store.changeRuleParameter(rule.id, draftParams());
    if (!result.ok) {
      setRefusal(result.refusal);
      return;
    }
    setEditing(false);
    setPreview(null);
  };

  const totalNoLonger = preview?.noLongerFiring.reduce((s, c) => s + c.totalBaseCents, 0) ?? 0;

  return (
    <article className="rounded-card bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{rule.id}</span>
            <span className="text-xs text-ink-muted">v{rule.version}</span>
            <StatusBadge outcomeClass={rule.outcomeClass} />
            {rule.locked ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-white">Locked</span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[13px]">{rule.statement}</p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {paramDisplay(rule)} · effective {rule.effectiveFrom}
          </p>
          {rule.locked ? (
            <p className="mt-1 text-[11px] text-ink-muted">
              Cannot be disabled or loosened here. A change needs a Manager and the CFO to co-approve, and the
              requester cannot co-approve.
            </p>
          ) : null}
        </div>
        {editable && !editing ? (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-md border border-ink/20 px-3 py-1.5 text-xs hover:border-ink/50"
          >
            Edit…
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3 border-t border-canvas pt-3">
          <div className="flex flex-wrap gap-3">
            {(config ?? []).map((c) => (
              <label key={c.key} className="text-[12px] text-ink-muted">
                {c.label} {c.unit === 'usd' ? '($)' : '(%)'}
                <input
                  type="number"
                  className="ml-2 w-28 rounded-md border border-routine-tint bg-surface px-2 py-1 text-[13px] text-ink"
                  value={draft[c.key] ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={runPreview} className="rounded-md border border-ink/20 px-3 py-1.5 text-xs">
              Preview consequences
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!preview}
              className="rounded-md bg-ink px-3 py-1.5 text-xs text-white disabled:opacity-40"
            >
              Save as v{rule.version + 1}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-ink-muted">
              Cancel
            </button>
          </div>
          {!preview ? (
            <p className="text-[11px] text-ink-muted">A change can only be saved after its preview is shown.</p>
          ) : null}
          {preview ? (
            <div className="rounded-md bg-canvas p-3 text-[12px]">
              {preview.changed.length === 0 ? (
                <p>No invoice in the current history or queue would change.</p>
              ) : (
                <>
                  {preview.noLongerFiring.length > 0 ? (
                    <p>
                      {preview.noLongerFiring.length} invoice{preview.noLongerFiring.length === 1 ? '' : 's'},{' '}
                      {formatCents(totalNoLonger, 'USD')} in total, would no longer trigger {rule.id}
                      {rule.id === 'R08' ? ' and would auto-process' : ''}:
                      <span className="mt-1 block font-mono text-[11px]">
                        {preview.noLongerFiring.map((c) => c.invoiceNumber).join(', ')}
                      </span>
                    </p>
                  ) : null}
                  {preview.newlyFiring.length > 0 ? (
                    <p className="mt-1">
                      {preview.newlyFiring.length} invoice{preview.newlyFiring.length === 1 ? '' : 's'} would newly
                      trigger {rule.id}:
                      <span className="mt-1 block font-mono text-[11px]">
                        {preview.newlyFiring.map((c) => c.invoiceNumber).join(', ')}
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-2 text-ink-muted">
                    History figures are a what-if only; past decisions are never rewritten. Open invoices are
                    re-evaluated when the change is saved.
                  </p>
                </>
              )}
            </div>
          ) : null}
          {refusal ? <GuardRefusal refusal={refusal} /> : null}
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-3 border-t border-canvas pt-2">
          {history.map((h) => (
            <p key={h.id} className="text-[11px] text-ink-muted">
              v{h.rulesetVersion}: changed by {company!.users.find((u) => u.id === h.changedBy)?.name}, effective{' '}
              {h.effectiveFrom}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function RulesPage() {
  const { company, init } = useCompany();

  useEffect(() => {
    void init();
  }, [init]);

  if (!company) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-ink-muted">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header />
      <div className="mb-4">
        <h1 className="font-display text-lg font-semibold">Authority rules</h1>
        <p className="text-xs text-ink-muted">
          Rules are data, applied by the engine — never by the AI. People edit parameters and scope; new logic
          is a developer change. Policy is always shown in USD.
        </p>
      </div>
      <div className="space-y-4">
        {company.ruleset.rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </main>
  );
}
