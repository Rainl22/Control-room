# AI Invoice Control Room

Portfolio prototype: a supervision layer for AI-run accounts payable. Read `docs/BRIEF.md` first; it is the source of truth. The `.docx` in `docs/` is a snapshot only.

## Invariants (do not break)
- Outcome classes and precedence: Hard stop > Uncertainty > Authority > Routine.
- The AI may never lower a class, approve, schedule, edit records, or see data outside its assembled context. It can only escalate.
- Rules are data (rule records), evaluated by a pure function `evaluate(invoice, context, ruleset)`. Locked rules R01-R04 need Manager + CFO co-approval.
- The core package (rule engine, state machine, permissions, evidence validation) is pure TypeScript with tests and no UI imports.
- Authority is enforced by state-machine guards in the core, never in the UI or the prompt.
- Money is integer cents plus an ISO currency code. All rules evaluate in USD. Display currency is visual only, with a fixed demo FX rate.
- Every AI claim cites evidence IDs, and IDs are validated against the assembled context. No AI confidence score.
- Fail closed: AI failure or invalid output becomes Uncertainty / Unavailable, never Routine.
- Label every AI result as Live, Recorded run, or Staged example.
- Technical failure and bad judgment are different records. AIRun is never edited; JudgmentReview verdicts are appended.
- Corrections move forward only. Past decisions are never rewritten.

## Status
Phase 1 first (brief section 16), then Phase 2 routine sampling. Next: `docs/POLICY.md` (fictional company, roster, accounts), then types/schema, then build.

## Commands
None yet. Add test and dev commands here once the project is scaffolded.
