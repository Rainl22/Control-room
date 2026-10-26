# Build status — handoff summary

Last updated: 2026-10-26. This file is the session-to-session handoff; update it when milestones move.

## Links

- **Live app:** https://control-room-demo.netlify.app
- **Netlify admin:** https://app.netlify.com/projects/control-room-demo (site id `809e6abb-6ce2-4b45-8ec6-dcba72bfb001`)
- **Branches:** `main` holds everything and is the **Netlify production branch** — every push to `main` auto-deploys. Workflow: each session develops on its own branch, and the work is merged (fast-forwarded) to `main` once the user is happy; `main` is what's live. (`claude/compassionate-thompson-7xkfkx` is the original build branch, now merged.)

## Agreed decisions

- Next.js (App Router) + Tailwind v4; deploy on Netlify (user had it connected already).
- No SQLite: deterministic seed in code; company state lives **in the visitor's browser** (zustand). Reset = re-seed. Full page reload also resets — by design.
- Judgment model: `claude-opus-5-5` at low effort, via the server route `/api/ai-judgment` (the only server-side piece; reads `ANTHROPIC_API_KEY` from Netlify env, never shipped to the browser; per-IP + global rate limits, 200KB payload cap, max_tokens 1500). **Do not send `temperature` or forced `tool_choice` — current models 400 on them** (this bug broke live mode once already).
- Spend safety: org-level spend limit set in the Anthropic console, auto-reload OFF. User chose not to use a capped workspace key for now; the public endpoint risk was explained and accepted.
- PO model extension beyond the brief: `kind: 'standard' | 'blanket'` — R05 tolerance applies to standard POs, R04 balance guards blanket POs. Needed so recurring-service fixtures carry exactly the reasons the brief names.
- Architecture principle enforced in prompts and authored outputs: **the AI proposes only the class its own findings justify; rules set the floor in code.** Restating a rule as the AI's proposal pins the class after the rule is relaxed.

## Done (all browser-verified, 137 core tests green, CI on every push)

**Core (`packages/core`, pure TS, no UI imports):** types + AI output contract (strict zod; a smuggled confidence score is rejected); rule engine R01–R12 with fixed condition vocabulary and supplier-scoped overrides; reasons/gates/class merge (Hard stop > Uncertainty > Authority > Routine; AI can only raise; AI failure fails closed to Uncertainty/Unavailable); state machine with every section-6 transition guarded plus `blocked→rejected` (section 7) and approval limits that match the rules triggered (signature gates → approval limits; uncertainty-only → resolver limits, Operator ≤ $10k); permissions matrix + both segregation rules; evidence objects with citation validation; analysis packets (J1 similarity scoring with tunable 0.75 threshold, J2 line diffs); replay preview (`replayRuleChange`); deterministic seed exactly matching `docs/POLICY.md` (60 invoices, 8 fixture anchors).

**App (`apps/web`):** home (top five in bands + class cards + spot-check card), queue (sortable/filterable/groupable, hard stops always pinned, reset to smart order), review detail (AI brief panel with evidence chips + provenance label, rule results, gates computed from facts with open/done marks, consequence line with funding account + balance-after, role-tailored actions, back + prev/next), rules screen (editable params per role, consequence preview required before save, locked-rule co-approval with requester exclusion, new-logic requests), history, verification path (two-person, segregation enforced, sole-manager trap warned about in advance; step 2 reviews the *record* — confirming a not-confirmed outcome rejects + flags), mistake reporting (pull-back before the Thursday run / recovery case after, "missed" verdicts appended to AIRuns which are never edited), supplier-scope corrections offered after false-alarm dismissals, **Phase 2 routine sampling** (deterministic weekly sample incl. the 6a miss, confirm/flag, verdict summary with staged counted separately). All 8 scenarios of the brief are completable end to end; both scenario-6 discovery routes work.

**AI provenance chain (brief §14):** live by default on the five genuine fixtures only → automatic fallback to recorded runs → authored outputs labelled Staged (temporary) → fail closed. 2b/6a/6b are pinned staged forever. Header shows "AI: live" / "AI: staged only".

## UX pass 2026-10-26 (from user's live-site review)

Done: loading state (spinner + skeleton, header shell stays visible) on every screen; Routine badge icon is now a small solid dot (was an outlined circle that read as a radio button); header nav is pill tabs with a home icon, active view highlighted (invoice pages keep Queue lit); detail-view back link now says "Back" and uses browser history (falls back to /queue); cited evidence renders as open-by-default accordion cards side by side with humanized labels/values instead of overlapping dark code popovers; "System · AI run failed" card retitled "Why this failed" with plain copy; Gates card retitled "What's holding this up" with human copy ("To do" / "Done", "Rule R01", "AI flagged"). The AI-unavailable reason text lives in `packages/core/src/reasons.ts`.

**Deliberately not done (user's call):** (4) app rename — decided 2026-10-26: the product's display name is **AProve** (header wordmark + browser tab title only). "Control Room" remains the internal/project name (repo, packages, docs, CLAUDE.md). Header (2026-10-26): hamburger menu beside the wordmark holds Currency / Role (hover or click the chevron for choices) and Reset demo; AProve wordmark is the home link; the three view tabs are centred below; AI pill on the right; the demo-date and subtitle copy were removed. (9) "?" tooltips on cards (Rule results, Gates, class badges, evidence) — discussed and recommended (2-sentence copy kept in one data file, keyboard/tap accessible, link to Rules page) but not built; do as a separate pass after naming.

Queue/rules pass (2026-10-26): search boxes on the queue (invoice, supplier, reason) and rules (ID, wording, class, "locked"); uncertainty pills in lists are one word via `StatusBadge compact` ("Conflict", "Unavailable"; class still carried by triangle + amber); queue header and rows share one fixed-column layout so nothing spills into the Invoice column; class group labels read "Hard stops / Uncertainty / Authority". Rules page now says why a card has no button: locked = Request change (Manager + CFO co-approval); unlocked = Edit for Manager/CFO only, otherwise a line says who can edit and which role you are acting as; rules with no settings say changes are a developer change.

Role-aware pass (2026-10-26): "Consequence" card renamed "Payment impact"; search is a small box at the far right of the filter row (queue) / title row (rules); all selects share a custom chevron with right padding (global `select` style); new reusable `HelpTip` ("?" on hover/focus/tap) now explains on every rule card who can change it and what the current role can do; "Request change…" only shows for roles allowed to file (Manager+; the store guard already refused Operators); the authority badge reads "Needs your signature" only for roles that can approve, else "Needs a signature", and rule cards use the neutral wording. **Open policy questions for the user (brief §7/§8 — not changed):** may the CFO perform verification step 2? what is the release path when the only Manager recorded step 1? should Manager/CFO get a "waiting on you" highlight for signature items?

## Immediate next steps

1. **Verify live mode on the deployed site** (the `temperature` fix was the last push): open INV-4410, expect a real brief labelled Live. If it fails, read Netlify → Logs → Functions.
2. **Record genuine runs**: needs `ANTHROPIC_API_KEY` visible to the cloud session (environment settings → Network secrets; `api.anthropic.com` is directly reachable from the sandbox). Then `npm run record` writes `apps/web/src/lib/recorded-runs.json`; commit it, then delete `apps/web/src/lib/placeholder-runs.ts` usage for the genuine fixtures (recordings take precedence automatically; placeholders become dead weight once recordings exist). Note: the sandbox egress **blocks `*.netlify.app`**, so the deployed site cannot be tested from the session — the user tests it.
3. AI panel label decided 2026-10-26: "AI analysis · N sources cited" (deviates from brief §12 wording on purpose). The failed-run card ("Why this failed") no longer shows a provenance pill — nothing was AI-written there. AI analysis card restyled (option A): white card with shadow, 3px violet left bar (`--color-ai`, used only for AI content; no class uses it), violet uppercase eyebrow, no icon (user: no sparkle icons), provenance (Live / Recorded run / Staged example) moved to a quiet footer line — neutral grey, since color means class only.

## Remaining backlog (in rough order)

- Demo controls (brief §13): run payments now, simulate an unavailable source, mark evidence received / on-hold flow in the UI.
- Design polish pass against brief §12 (shadows, density, remaining component states); cap effort — the design-system budget is mostly spent.
- Case study + recorded walkthrough (Phase 1 + 2, stating which fixtures are staged) — the actual portfolio deliverable.

## Working agreements

- `docs/BRIEF.md` is the source of truth; `docs/POLICY.md` anchors all numbers. If it doesn't strengthen the human-supervision story, cut it.
- Validate before pushing (`npm test`, `npm run typecheck`, `next build`); browser-verify flows with Playwright (preinstalled).
- The user reviews on the live site and gives screenshot feedback; expect UX passes like the one that caught the verification-semantics bug.
