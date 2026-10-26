# AI Invoice Control Room: build brief (v5)

*Portfolio concept and working simulation. Not a deployed finance product.*

A supervision layer for accounts payable. Rules hold the line, AI interprets the fuzzy parts, and a human decides what is left.

| Core idea | Build level | Portfolio signal |
|---|---|---|
| Sits between an existing invoice-extraction tool and the company's financial records. Decides what can proceed, what needs a person, and what is blocked. | Functional prototype. Real rules engine, state machine and AI judgment on synthetic data. Upstream and downstream connectors are simulated. | Product thinking for autonomous systems: authority, evidence, exceptions, correction and auditability. |

**What changed in v5:** USD is now the base currency, and display currency is a visual setting only. Added routine sampling as Phase 2, payment accounts, the split between a technical AI failure and a bad AI judgment, three labels for AI results (Live, Recorded run, Staged example), and what each correction scope changes afterwards. The demo-mode and queue decisions from review are settled in sections 3 and 14. Nothing is blocking; the policy and roster come next.

## 1. Position and premise

Control Room is not an extractor, and it is not the accounting or payment system. It is the decision-and-supervision layer between them.

```text
Upstream (simulated)        Control Room (built)                    Downstream (simulated)
Invoice-extraction tool  ->  Rules + AI judgment + human attention  ->  Accounting / ERP and payment
```

Control Room also reads company context: supplier records, verified bank details, purchase orders, prior invoices and payments, and the company's policy. In the prototype that context is synthetic, and structured invoice records arrive in the shape a real extraction connector would deliver them. “Vendor-agnostic” is a design claim, not an architecture claim: the supervision experience would not change if the extractor or ERP did.

### The product question

If routine invoice work can be delegated, what does the finance manager still need to see, decide and control? After automation the human job is to:

- Set the boundaries of what the AI may do.

- Decide the cases that need judgment or authority.

- Understand why a recommendation was made and inspect the evidence.

- Correct mistakes and change future behaviour, with an explicit scope.

## 2. Four outcomes

Every invoice ends up in exactly one class. When several apply, the highest wins in this order: Hard stop, Uncertainty, Authority, Routine. Uncertainty outranks Authority on purpose: a person cannot meaningfully sign for something that has not been understood. The invoice still shows every reason, not only the winning one.

| **Outcome**     | **Meaning**                                                                    | **Example**                                                                            | **System behaviour**                                                                                    |
|-----------------|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| **Routine**     | No rule fired and the AI raised nothing.                                       | Known supplier, \$420 recurring software invoice, valid PO, unchanged bank details.    | Proceeds on its own. Visible in history, never in the queue.                                            |
| **Authority**   | Everything is understood and verified. Policy requires a named person to sign. | Valid \$18,000 invoice; approval is mandatory above \$10,000.                          | AI prepares the action. A person with a sufficient role approves, with evidence and consequences shown. |
| **Uncertainty** | Data conflicts, is missing, or could not be reached. A person must interpret.  | Invoice says \$680; the approved PO says \$620.                                        | AI shows what it found and what it tried. The person decides, or places the invoice on hold.            |
| **Hard stop**   | Trust is not established, so approval alone cannot fix it.                     | Bank details changed shortly before an \$8,420 payment, or the supplier is unverified. | Payment blocked. A prescribed verification (section 7) must be completed first.                         |

### Reason kinds inside Uncertainty

Every Uncertainty reason carries a kind, because each recovers differently. Hard-stop reasons are kind Trust and Authority reasons are kind Signature.

| **Kind**        | **Meaning**                   | **Example**                                           | **Recovery**                                                                                          |
|-----------------|-------------------------------|-------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| **Conflict**    | Two sources disagree.         | Invoice \$680, PO \$620.                              | The person decides which is right, or accepts the difference with a note.                             |
| **Missing**     | Something expected is absent. | No PO reference on the invoice.                       | The AI searches for candidates. If none fits, the invoice goes on hold and the document is requested. |
| **Unavailable** | A source could not be read.   | The PO system did not respond, or the AI call failed. | One automatic retry, then “context unavailable” with a manual retry action. Never treated as Routine. |

## 3. The decision flow

One pipeline, ten steps, each owned by code, the AI or a person. The rules run before the AI and set a floor. The AI can only raise that floor, never lower it.

| **\#** | **Step**                 | **Owner**      | **What happens**                                                                                                                                                                                                                      |
|--------|--------------------------|----------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1      | **Record arrives**       | System         | A structured invoice record enters through a connector-shaped interface (synthetic in the prototype).                                                                                                                                 |
| 2      | **Context assembly**     | Code           | Gathers the supplier record, verified bank details, matching PO, prior invoices and payments, and the active ruleset version. Every fact placed in the context becomes an evidence object with an ID (section 4).                     |
| 3      | **Rule evaluation**      | Code           | Runs every active rule. Output: rule results and a rule floor, the highest class any rule produced.                                                                                                                                   |
| 4      | **Analysis packets**     | Code           | Calculates what the AI should interpret instead of guess: near-duplicate candidates with similarity scores, PO candidates, line-item differences against the PO.                                                                      |
| 5      | **AI judgment**          | AI             | One structured call receives the record, context, rule results and packets. It returns findings, a proposed class and action, and the review brief.                                                                                   |
| 6      | **Merge**                | Code           | Final class is the higher of the rule floor and the AI's proposal. All reasons are collected and ranked. If the AI call fails or returns invalid output, the invoice becomes Uncertainty (Unavailable). It never defaults to Routine. |
| 7      | **Routing**              | System         | Routine proceeds. Authority and Uncertainty enter the attention queue. Hard stop is blocked, with its verification path attached.                                                                                                     |
| 8      | **Human decision**       | Human          | The person works through the invoice's gates and decides. The decision stores the evidence the person saw.                                                                                                                            |
| 9      | **State transition**     | State machine  | The only place an invoice changes state. It refuses any transition whose guard is not met (section 6).                                                                                                                                |
| 10     | **Audit and correction** | System + human | Every step is logged with the ruleset version, the packets and the AI output. Corrections carry an explicit scope (section 7). A correction that changes a fact re-runs steps 2 to 6.                                                 |

### Reasons, gates and ordering

Every rule hit, and every AI finding that raises the class, becomes a **reason**: an ID, a source (rule or AI), a kind, a class, a fixed rank and its evidence IDs. A reason in class Authority or above is also a **gate**: a condition that must be cleared before the invoice can move.

- **Primary reason.** The highest class wins. Ties go to the lowest rank in the rule catalogue (within a class, lower ID means higher rank). AI-sourced reasons rank after rule reasons in the same class. The queue shows the primary reason and a “+N more” count.

- **Gates are derived, never ticked.** The review screen lists every gate with its status, but the system computes whether each one is cleared from facts: a recorded verification, an approval from a sufficient role, a corrected amount. Nobody can tick a box to clear a gate.

- **Resolution order.** Hard stop gates first, then Uncertainty, then Authority. Approval is always last, so nobody signs for something not yet understood.

- **Corrections re-run the pipeline.** When a correction changes a fact, steps 2 to 6 run again and the reasons are recomputed. Some disappear and new ones can appear.

### Queue order

**Default (“smart”) order:** hard stops pinned to the top, then payment due date, soonest first with overdue items at the very top, then amount, largest first. Class is shown as a label and a filter rather than a sort key, because due date is what drives urgency in accounts payable. The default is a design decision that usability testing should challenge.

- **Sorting.** On the full queue page every column is sortable and filterable, and a group-by control (due date, class or supplier) is available. “Reset to smart order” is always one click away. Saved personal sort preferences are out of scope for now.

- **Hard stops stay pinned** above any sort or grouping the person applies, so nobody can sort a fraud risk out of sight.

- **Home is not a sortable surface.** It shows the top five in the default order, grouped in bands (Hard stops, Overdue, Due this week, Later) so the order explains itself, plus a count per class that links to the filtered queue.

## 4. Rules versus AI: who owns what

**The test:** if the answer must be identical every time and someone could be held accountable for it, it is a rule. If it needs reading context, weighing similarity or explaining something, it is the AI's job.

### Rules own the lines that must not move

Approval thresholds, changed bank details, unverified suppliers, currency limits, exact duplicates, required fields, PO tolerances and who may approve what. No AI is involved in any of these, and the AI cannot alter their results. The starter catalogue is in section 10.

### Code retrieves and calculates; the AI interprets

Anything countable, comparable or searchable is done in code and handed to the AI as an analysis packet: similarity scores, PO candidates, line-item arithmetic. The AI's job is the reading, weighing and explaining that code does badly. That keeps the AI's inputs auditable, makes its work testable against fixtures, and keeps number-heavy claims out of the model. It also settles the module shape: deterministic retrieval and scoring first, then a single structured AI call.

### The AI's jobs

| **Job**                      | **Code prepares**                                                                                                                                                                                                    | **AI does**                                                                                                                                       | **Scope** |
|------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|-----------|
| **J1. Near-duplicate**       | Candidate prior invoices from the same supplier, scored by similarity: amount, date proximity, invoice-number distance, line-item overlap. Candidates scoring 0.75 or more (a tunable parameter) go to the AI.       | Judges each candidate: likely repeat, likely legitimate recurrence, or unclear, and says why. Likely repeat or unclear raises Uncertainty.        | v1        |
| **J2. Mismatch explanation** | Line-item differences against the PO, and the supplier's history of similar lines.                                                                                                                                   | Explains the difference and proposes accept, query supplier or reject.                                                                            | v1        |
| **J3. Missing-PO search**    | Open POs from the same supplier, ranked by amount and description similarity.                                                                                                                                        | Assesses the candidates and recommends one or none. A person confirms any link.                                                                   | Stretch   |
| **J4. Pattern anomaly**      | Statistics against the supplier's baseline: the last 12 months, at least five invoices, amount against median and maximum. Under five invoices the system records “insufficient history” and makes no anomaly claim. | Interprets unusual line descriptions or timing. Can escalate, never reduce.                                                                       | Later     |
| **J5. Review brief**         | The evidence list, rule results and findings.                                                                                                                                                                        | Writes the plain-language summary: what happened, why the person is seeing it, the recommendation, what happens next. Every claim cites evidence. | v1        |

**The near-duplicate trade-off.** The 0.75 threshold decides what the AI sees. The AI's assessment decides what a person sees. Too high, and real duplicates never reach the AI. Too low, and the queue fills with false alarms. When the AI judges a candidate legitimate, the audit log records the candidate and the reason, so a silent pass can still be explained. The trade-off belongs in the case study.

### No AI confidence score

Model-reported confidence is poorly calibrated, and a number in the interface invites false precision. So findings carry an **assessment** (supports, contradicts or unclear) plus cited evidence, and nothing the AI says about its own certainty changes routing. Anything the interface needs as a number, such as near-duplicate similarity, is computed in code and shown with its inputs. Extractor confidence, which arrives from upstream, feeds rule R07 only.

### Two kinds of AI failure

The audit trail must never blur these two.

|                          | **Technical failure**                                                                                         | **Bad judgment**                                                                                                                                                       |
|--------------------------|---------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **What happened**        | The AI call timed out, errored, returned output that fails the schema, or cited evidence that does not exist. | The call succeeded and passed validation, but the finding was wrong: a false alarm or a miss.                                                                          |
| **When it is known**     | Immediately.                                                                                                  | Only later, through a correction, a dismissal or a spot check. At the time it looks completely valid.                                                                  |
| **What the system does** | The invoice goes to Uncertainty (Unavailable) and the failure type is logged.                                 | Nothing at the time. Afterwards a verdict is attached to the original run.                                                                                             |
| **How history shows it** | A system event on the invoice timeline, such as “AI run failed (timeout)”.                                    | The original entry stays exactly as it was, with a later annotation such as “Marked as missed by the Finance Manager, via spot check”. The run itself is never edited. |

A verdict has three values: **confirmed** (implicit when nobody disputes it), **false alarm** (flagged something safe) and **missed** (did not flag something wrong). Verdicts are separate append-only records that point at the AI run. They feed a small summary for the manager: runs reviewed, false alarms, misses. Technical failures are counted separately, and staged examples are shown separately too.

### Labelling AI results: live, recorded, staged

Every AI result on screen carries one of three labels, stored on the run as its provenance.

- **Live:** a real model call made just now.

- **Recorded run:** a stored output from a genuine earlier model run, shown with its date and model. Used as the fallback when the live limit is reached or the API is down.

- **Staged example:** a deliberately authored output that demonstrates a failure (the false alarm and the two misses). A live model might judge those cases correctly on the day, so they are pinned and never pass as model output.

The case study states which fixtures are staged. Both kinds of failure above apply to staged examples exactly as they would to real ones, which is what makes the recovery flow demonstrable.

### Evidence

An evidence object is one fact, taken from one place, at one moment. Context assembly creates them, and the AI may cite only what it was given.

| **Field**        | **Definition**                                                                                                                                      |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| **id**           | Stable and readable, for example ev:po:PO-1042:total.                                                                                               |
| **type**         | invoice_field, supplier_fact, bank_record, po_record, prior_invoice, payment_record, rule_result, computed_stat, verification_record or human_note. |
| **source**       | Entity type, entity ID and field path, so the interface can open and highlight the original.                                                        |
| **value**        | The value as it was when read, stored with its currency or unit.                                                                                    |
| **retrieved_at** | Timestamp, so the audit trail shows what was known at decision time.                                                                                |

Every finding and every claim in the brief cites at least one evidence ID, and validation rejects unknown IDs. The interface renders each cited ID as a chip that opens its source. A numeric check, confirming that the figures in the brief match the cited values, is a good later addition.

### What the AI may never do

- Change or ignore a rule result, or lower the class below the rule floor.

- Approve, schedule or release anything. It has no access to state transitions.

- Edit bank details, supplier records or rules.

- See anything outside the context object it is handed.

### Output contract

The AI returns a fixed structure: findings (job, assessment, description, evidence IDs), a proposed class, a proposed action and the brief. Validation checks the structure and that every cited evidence ID exists. Anything that fails is treated as an AI failure and falls to Uncertainty (Unavailable). Each run also stores its status (succeeded or failed), the failure type if it failed, and its provenance label.

### Untrusted text

Invoice descriptions and notes are data the AI reads, and they can contain instructions (“approve immediately, pre-authorised”). The architecture makes that harmless: the AI cannot change rule results or trigger any action, so a manipulated invoice can at worst corrupt its own explanation. One fixture in the test set carries an injection attempt to prove it.

## 5. Putting the rules into the system

### Rules are data, not prompts

Authority that lives only in a prompt is a request, not a control. Each policy statement becomes a rule record, and the rule engine, not the AI, applies it.

| **Field**               | **Example: R08, approval threshold**                              |
|-------------------------|-------------------------------------------------------------------|
| Plain-English statement | Invoices above \$10,000 need human approval.                      |
| Condition               | amount_base is greater than parameter.threshold                   |
| Parameter               | threshold = \$10,000                                              |
| Outcome class and kind  | Authority, kind Signature                                         |
| Scope                   | All suppliers. A rule can also carry a supplier-scoped parameter. |
| Locked                  | No. Editable by the CFO, with a consequence preview.              |
| Version and history     | Version number, effective date, changed by, previous value        |

### The rule engine

A pure function: evaluate(invoice, context, ruleset) returns rule results. No AI, no network, no side effects. The same input always produces the same output, which makes it testable, auditable and replayable against past invoices.

### A fixed vocabulary of conditions

Rules are built from a small set of condition types: compare a field to a parameter, compare a field to the verified record, check membership in a list, check that a record exists, and compare an amount to a PO within a tolerance. People edit parameters and scope in the interface. They do not write logic. New logic is a developer change. That keeps the authority screen safe: nobody can compose a rule that gives the AI too much.

### Locked rules

R01, R02, R03 and R04 cannot be disabled or loosened from the interface. Changing one needs a Finance Manager and the CFO to co-approve (simulated), and the person who requested the change cannot co-approve it.

### Previewing a rule change

Because the engine is pure, the authority screen can replay a proposed change against the synthetic invoice history before it is saved: “raising the threshold to \$15,000 would have auto-processed 6 of 62 invoices, \$81,400 in total, that currently need approval.” (Figures illustrative.) This is the consequence preview, and it is cheap to build once the engine exists.

### Audit

Every decision stores the record snapshot, ruleset version, rule results, analysis packets, the AI output, the human decision, who made it and timestamps. “Why did this happen?” is answerable for any invoice, including routine ones.

## 6. The state machine

The interface hides buttons a person may not press, but the guard is what refuses. It runs in application logic, outside the prompt and the UI, and the AI has no access to it.

### States

Received, Checking, Ready, Awaiting attention, Investigating, On hold, Blocked, Approved, Payment scheduled, Paid (simulated), Rejected and Recovery.

- **Investigating:** a short AI re-check after a person asks for more work or adds a note or evidence. It is transient and returns to Awaiting attention with updated findings.

- **On hold:** waiting for something outside the system, such as a supplier document. The hold records what is awaited and who owns it. The only way out is “evidence received”, which re-runs the pipeline. The prototype simulates the supplier's reply with a demo control.

- **Recovery:** a case opened after money has moved.

| **Transition**                        | **Guard**                                                                                                                  |
|---------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Received → Checking                   | The record is structurally valid.                                                                                          |
| Checking → Ready                      | Final class is Routine.                                                                                                    |
| Checking → Awaiting attention         | Final class is Authority or Uncertainty.                                                                                   |
| Checking → Blocked                    | Final class is Hard stop.                                                                                                  |
| Awaiting attention → Investigating    | A user with the Operator role or above requests it, optionally with a note or evidence.                                    |
| Investigating → Awaiting attention    | The re-run finished and findings are updated. If the re-run fails, a new Unavailable reason is added.                      |
| Awaiting attention → On hold          | A user records what is awaited and who owns it.                                                                            |
| On hold → Awaiting attention          | Evidence is recorded as received. The pipeline re-runs.                                                                    |
| Blocked → Awaiting attention          | The verification path is complete and confirmed (section 7). The pipeline re-runs.                                         |
| Awaiting attention → Approved         | Every gate is cleared and an approval exists from a user whose role covers the amount and the rules triggered (section 8). |
| Awaiting attention → Rejected         | A user with a sufficient role records a reason. Terminal.                                                                  |
| Ready or Approved → Payment scheduled | No active hard-stop gate, and the class is Routine or a valid approval exists.                                             |
| Payment scheduled → Checking          | Allowed only before the payment run, with a correction record. The pipeline re-runs.                                       |
| Payment scheduled → Paid              | The simulated payment run executes (a demo control). This is the “money has moved” moment.                                 |
| Paid → Recovery                       | A mistake is reported after payment. Cannot be undone; a recovery case opens (section 7).                                  |
| Any state before payment → Checking   | A correction record exists with its scope.                                                                                 |

## 7. Verification, correction and recovery

### The hard-stop verification path

One path serves both triggers: changed bank details (R01) and an unverified supplier (R02). It is deliberately short.

1.  An Operator or Manager contacts the supplier using the contact details already on the supplier record, never those printed on the invoice. They record who they spoke to, when, and the outcome: confirmed or not confirmed. In the prototype this is a short form.

2.  A different person with the Manager role reviews that record and confirms or rejects it. The person who did step 1 cannot do step 2. With two Managers on the team, the other Manager always can. If no Manager other than the step-1 person exists, the case can be escalated to the CFO, who may then perform step 2; escalation is unavailable while another Manager can do it.

3.  If confirmed, the bank details are marked verified on the supplier record (and an unverified supplier becomes verified), and the invoice returns to Awaiting attention for re-evaluation. If not confirmed, the invoice is rejected and the supplier is flagged.

The verification record is an evidence object, so the audit trail shows exactly what cleared the stop.

### Correction scopes

A correction says what was wrong and how far the fix reaches. The scope is chosen explicitly and previewed before it is saved.

| **Scope**          | **What it does**                                                                                                                                                       | **Example**                                                                                                                            | **Cannot do**                                                       |
|--------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| **This invoice**   | Fixes the record or the decision for this invoice only, then re-runs the pipeline.                                                                                     | Wrong amount extracted. Or mark as duplicate and reject.                                                                               | Change anything for other invoices.                                 |
| **This supplier**  | Updates a supplier fact, or sets a supplier-scoped parameter on an editable rule. Facts enter the context as evidence, labelled with who set them and when.            | “Bills monthly at a fixed amount with distinct invoice numbers” stops repeat false alarms. A 5% tolerance for this supplier's freight. | Touch a locked rule, or change how the AI reasons.                  |
| **Rule parameter** | Edits an existing, permitted rule parameter through the rule-change workflow: permission check, replay preview, effective date and a new ruleset version.              | Raise the PO tolerance from 2% to 3%.                                                                                                  | Edit a locked rule alone, or add a condition.                       |
| **New logic**      | A request for something the rule vocabulary cannot express. Filed with example invoices and sent to a developer. The prototype logs it as pending in the rule history. | “Flag any invoice with a rounding-error total.”                                                                                        | Change any behaviour until a developer ships a new ruleset version. |

Nothing is learned silently. The AI's behaviour changes only because a supplier fact or a rule parameter changed, and both are visible and versioned.

### After a correction

Corrections move forward only. A decision already made keeps the ruleset version, supplier facts and AI run it was made under, and is never rewritten. What a correction changes next depends on its scope.

| **Scope**          | **What changes**                                                                     | **What is re-evaluated**                                                                                                                        | **What is never touched**                           |
|--------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| **This invoice**   | The invoice's record or decision.                                                    | This invoice only, from step 2 of the pipeline.                                                                                                 | Any other invoice, supplier fact or rule.           |
| **This supplier**  | A supplier fact, or a supplier-scoped rule parameter, with who set it and when.      | Every open invoice from this supplier (awaiting attention or on hold), because its context changed. The preview shows which would change class. | Invoices already approved, paid or rejected.        |
| **Rule parameter** | One parameter of one existing rule, as a new ruleset version with an effective date. | Every open invoice that rule affects. The preview also replays the change against history, as a what-if only.                                   | Past decisions. Locked rules.                       |
| **New logic**      | Nothing in the system. A pending request is recorded.                                | Nothing, until a developer ships a new ruleset version.                                                                                         | Everything. A finance manager cannot invent a rule. |

Every scope shows its preview before it is saved: the open invoices that would be re-evaluated and which of them would change class. When a correction moves an open invoice, an audit event on that invoice says why.

### Reversal and recovery

| **Situation**                       | **What happens**                                                                                                                                                                                                                                                |
|-------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Wrong, found before the payment run | The invoice is pulled back from the schedule, a correction record is created and the pipeline re-runs. This applies to Routine invoices too. If the AI missed the problem, a “missed” verdict is attached to the original run.                                  |
| Wrong, found after the payment run  | It cannot be undone. A recovery case opens with what was paid, the cause and next steps (request a recall from the supplier or bank, simulated), each with an owner. The invoice is flagged on the supplier's record, and any AI miss is recorded as a verdict. |
| Approved in error by a person       | Handled by timing, as above. The audit trail shows who approved and which evidence they saw.                                                                                                                                                                    |
| AI wrongly flagged a safe invoice   | The person dismisses it with a reason, which records a “false alarm” verdict on the AI run, and is offered a supplier-scope correction so the same false alarm does not repeat.                                                                                 |

## 8. Roles and permissions

Three roles. The prototype has a role switcher in the top bar, which also demonstrates that the guards are real.

| **Action**                                  | **Operator**   | **Manager**             | **CFO**         |
|---------------------------------------------|----------------|-------------------------|-----------------|
| Request investigation or place on hold      | Yes            | Yes                     | Yes             |
| Correct an invoice record                   | Yes            | Yes                     | Yes             |
| Report a mistake                            | Yes            | Yes                     | Yes             |
| Resolve an Uncertainty reason               | Up to \$10,000 | Yes                     | Yes             |
| Approve an Authority gate                   | No             | Up to \$50,000          | Any amount      |
| Verification step 1 (contact the supplier)  | Yes            | Yes                     | No              |
| Verification step 2 (confirm)               | No             | Yes (not if they did step 1) | Only after escalation, when no other Manager can |
| Make a supplier-scope correction            | No             | Yes                     | Yes             |
| Edit editable rule parameters, with preview | No             | Yes, except R08 and R11 | Yes, all        |
| Co-approve a locked-rule change             | No             | Yes (one of two)        | Yes (the other) |
| Review a routine spot check (Phase 2)       | No             | Yes                     | Yes             |
| File a new-logic request                    | No             | Yes                     | Yes             |
| Work a recovery case                        | No             | Yes                     | Yes             |

Two segregation rules, kept deliberately few so a small finance team is not deadlocked: the person who performs verification step 1 cannot perform step 2, and the person who requests a rule change cannot co-approve it.

## 9. Data model

The minimum structure to build from. The exact schema lives in code as TypeScript types, plus a JSON schema for the AI output, generated from this section in the first build step.

### Conventions

- **Money** is stored as integer minor units (cents) with an ISO currency code. Never floating point.

- **IDs** are readable prefixed strings: sup\_, inv\_, po\_, pay\_, rsn\_, ev\_, dec\_.

- **Dates** are ISO 8601. Decisions, evidence and audit events are append-only.

- **Required on an invoice:** supplier reference, invoice number, issue date, due date, currency, total, at least one line, and the bank details shown on the invoice. **Optional:** PO reference, tax breakdown, line-level PO references. A record missing a required field is not rejected; it triggers R07.

| **Entity**         | **Key fields**                                                                                                                                                                                         | **Links**                                        |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| **Supplier**       | id, name, country, status (unverified or verified), default currency, verified contact (phone, email), facts\[\] (structured, each with who set it and when)                                           | Has many bank accounts, POs, invoices            |
| **BankAccount**    | id, supplier_id, holder, account number (fake), country, status (verified, pending or superseded), verified_by, verified_at                                                                            | Belongs to Supplier                              |
| **PurchaseOrder**  | id, supplier_id, reference, lines\[\], total, currency, balance_remaining, status (open or closed), requester                                                                                          | Has many Invoices                                |
| **Invoice**        | id, supplier_id, invoice_number, issue_date, due_date, currency, total, total_base, fx_rate, fx_as_of, tax, lines\[\], po_reference?, bank_details_on_invoice, extractor_confidence, state, source_ref | Resolves to a PO. Has Reasons, Decisions, AIRuns |
| **InvoiceLine**    | id, description, quantity, unit_price, amount, po_line_ref?                                                                                                                                            | Belongs to Invoice                               |
| **Payment**        | id, invoice_id, funding_account_id, amount, currency, scheduled_for, status (scheduled, paid or recalled), run_id                                                                                      | Belongs to Invoice and PaymentAccount            |
| **Rule**           | id, version, statement, condition_type, parameters, outcome_class, kind, scope (all or supplier), locked, effective_from                                                                               | Produces RuleResults                             |
| **RuleResult**     | invoice_id, rule_id, rule_version, fired, evidence_ids                                                                                                                                                 | Belongs to Invoice and Rule                      |
| **Reason**         | id, invoice_id, source (rule or ai), kind, class, rank, evidence_ids, gate_status (derived)                                                                                                            | Belongs to Invoice                               |
| **Evidence**       | id, type, source (entity, id, field path), value, retrieved_at                                                                                                                                         | Cited by Reasons, Findings, Decisions            |
| **AIRun**          | id, invoice_id, model, prompt_version, input hash, packets, status (succeeded or failed), failure_type?, provenance (live, recorded or staged), output JSON, validation result, created_at             | Contains Findings                                |
| **Finding**        | job, assessment (supports, contradicts or unclear), description, evidence_ids                                                                                                                          | Belongs to AIRun                                 |
| **JudgmentReview** | id, ai_run_id, job, verdict (confirmed, false_alarm or missed), set_by, set_via (correction, dismissal or spot_check), set_at                                                                          | Points at an AIRun. Append-only                  |
| **Decision**       | id, invoice_id, user_id, role, action, reason text, evidence_ids seen, created_at                                                                                                                      | Belongs to Invoice                               |
| **Verification**   | id, invoice_id, step 1 (user, contact used, spoke to, outcome), step 2 (user, outcome), created_at                                                                                                     | Evidence for R01 and R02 gates                   |
| **Correction**     | id, invoice_id, scope, change, reason, created_by, supplier_fact_id or rule_change_id                                                                                                                  | Belongs to Invoice                               |
| **SpotCheck**      | id, invoice_id, sampled_at, reviewer_id, outcome (confirmed or flagged), note (Phase 2)                                                                                                                | Belongs to a Routine Invoice                     |
| **User**           | id, name, role                                                                                                                                                                                         | Acts on everything above                         |
| **PaymentAccount** | id, name, type (operating, reserve or foreign currency), last4 (fake), currency, balance, minimum_balance. Two or three synthetic accounts.                                                            | Funds Payments. Read-only in the interface       |
| **Settings**       | base_currency (USD), display_currency (USD, GBP or EUR), demo_fx_rates with an as-of date                                                                                                              | Read by the interface and by invoice ingestion   |
| **AuditEvent**     | id, invoice_id, actor (system, ai or user), event, ruleset_version, snapshot ref, created_at                                                                                                           | Belongs to Invoice                               |

## 10. Starter rule catalogue

Routine is not a rule. It is what is left when no rule fires and the AI raises nothing. Within a class, a lower ID means a higher rank (so R12, added later, ranks last among the Uncertainty rules). Unavailable reasons come from the system, not from a rule. All figures are fictional and must stay consistent across the synthetic data.

| **ID** | **Rule**                                                                                                   | **Outcome** | **Kind**  | **Parameters**                       | **Editable**           |
|--------|------------------------------------------------------------------------------------------------------------|-------------|-----------|--------------------------------------|------------------------|
| R01    | Bank details on the invoice differ from the verified record.                                               | Hard stop   | Trust     | None                                 | Locked                 |
| R02    | Supplier is not verified.                                                                                  | Hard stop   | Trust     | None                                 | Locked                 |
| R03    | Exact duplicate: same supplier and invoice number as an existing invoice.                                  | Uncertainty | Conflict  | None                                 | Locked                 |
| R04    | PO is closed, or its remaining balance is insufficient.                                                    | Uncertainty | Conflict  | None                                 | Locked                 |
| R05    | Amount differs from the PO beyond tolerance.                                                               | Uncertainty | Conflict  | ±2% or \$25. Can be supplier-scoped. | Yes, with preview      |
| R06    | A PO is required but the invoice has no PO reference.                                                      | Uncertainty | Missing   | PO required above \$500              | Yes                    |
| R07    | A required field is missing, or extractor confidence is low.                                               | Uncertainty | Missing   | Confidence below 85%                 | Yes                    |
| R08    | Amount is above the approval threshold.                                                                    | Authority   | Signature | \$10,000                             | CFO only, with preview |
| R09    | Currency is outside the allowed list. Needs Manager approval at any amount.                                | Authority   | Signature | Allowed: USD                         | Yes, with preview      |
| R10    | Payee bank account is outside the home country. Needs Manager approval at any amount.                      | Authority   | Signature | Home country: US                     | Yes, with preview      |
| R11    | Approver role limits, applied at the approval guard.                                                       | Authority   | Signature | Manager up to \$50,000, then CFO     | CFO only, with preview |
| R12    | Funding account balance after scheduled payments would fall below its minimum. Documented only, not built. | Uncertainty | Conflict  | Minimum balance per account          | Yes                    |

## 11. Scenario matrix

Six scenarios and eight fixtures are built first. Each shows a different split of responsibility between rules, AI and human. Fixtures 2b, 6a and 6b are staged examples (section 4); the others use genuine model runs.

| **Scenario**                                   | **Rules**                 | **AI**                                                                         | **Final class**   | **What it shows**                                                                                                                                     |
|------------------------------------------------|---------------------------|--------------------------------------------------------------------------------|-------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **1. Known supplier, amount matches PO**       | None                      | Reviews candidates and history, finds nothing.                                 | Routine           | Routine work stays invisible. Visible only in history.                                                                                                |
| **2a. Near-duplicate, true repeat**            | None (not an exact match) | J1 judges INV-2041 a likely repeat of INV-2014.                                | Uncertainty       | The AI alone caused the interruption. This is the case for having an AI.                                                                              |
| **2b. Near-duplicate, false alarm**            | None                      | J1 wrongly judges a legitimate monthly invoice a likely repeat. (Staged.)      | Uncertainty       | The cost of an AI false positive. The person dismisses it, which records a “false alarm” verdict, and a supplier-scope correction stops it recurring. |
| **3. Invoice above PO (\$680 vs \$620)**       | R05                       | J2 finds a \$60 freight line and proposes accepting it.                        | Uncertainty       | The rule decides that a person looks. The AI makes that look take seconds.                                                                            |
| **4. Valid \$18,000 invoice**                  | R08                       | J5 writes the brief only.                                                      | Authority         | Everything checks out and a person is still required. Not the same as “AI is unsure”.                                                                 |
| **5. Bank details changed**                    | R01                       | J5 explains the risk. Adds nothing to the class.                               | Hard stop         | The rule decides, the AI explains, and the verification path clears it.                                                                               |
| **6a. AI miss, caught before the payment run** | None                      | J1 wrongly judges a true duplicate legitimate. The invoice proceeds. (Staged.) | Routine (wrongly) | In Phase 1 a person finds it by browsing recent activity. In Phase 2 a spot check can catch it. Pulled back and corrected, with a “missed” verdict.   |
| **6b. AI miss, caught after the payment run**  | None                      | Same as 6a. (Staged.)                                                          | Routine (wrongly) | It cannot be undone, so a recovery case opens, and the miss is recorded as a verdict.                                                                 |

**Documented, not built first:** unverified supplier (R02, which shares the verification path with scenario 5 and is nearly free to add), foreign currency (R09), international payee (R10), unreadable document (R07), an unavailable source and insufficient funds (R12). **First stretch:** missing PO (R06 plus J3), because it shows the AI searching rather than judging. The injection attempt lives in the test set, not the demo.

## 12. Visual language

### Reference and intent

Mood reference: two dashboard shots supplied by Rain, with a pale canvas, white cards, soft shadows and one blue family. They are used for restraint and atmosphere only. The layout and composition are original, and the reference's decorative shapes, icon tiles and low-contrast grey text are deliberately left behind.

### Three principles

- **Quiet by default.** Routine work has no color at all. Saturated color is spent only on things that need a person.

- **Color means class, and only class.** Never decoration. Never color alone: every class also has its own shape and label.

- **Provenance is visible.** A person can always tell what a rule computed, what the AI wrote and what a human decided.

### Starter tokens

Values are placeholders sampled by eye, with contrast ratios calculated against WCAG. Replace them by sampling the reference or building the scales in Radix Colors, and keep the contrast results.

| **Token**   | **Value**                      | **Use**                                                                                    | **Contrast**                  |
|-------------|--------------------------------|--------------------------------------------------------------------------------------------|-------------------------------|
| canvas      | \#F4F6FB                       | Page background.                                                                           | Ink on canvas 13.4:1          |
| surface     | \#FFFFFF                       | Cards, tables, panels, with soft shadows rather than borders.                              | Ink on white 14.4:1           |
| ink         | \#1B2A41                       | Text, primary buttons, focus and selection. Never competes with class colors.              | White on ink 14.4:1           |
| ink-muted   | \#4B5870                       | Secondary text, and the Routine label.                                                     | 7.2:1 on white                |
| authority   | \#E8EDFC tint, \#3F5BD0 strong | Authority badge, icon and left edge. The periwinkle from the reference, darkened for text. | 5.0:1 on tint, 5.8:1 on white |
| uncertainty | \#FDF1D8 tint, \#8A5A00 strong | Uncertainty badge, icon and left edge.                                                     | 5.3:1 on tint, 5.9:1 on white |
| hard stop   | \#FBE4E1 tint, \#A93226 strong | Hard stop only. Red appears nowhere else in the product.                                   | 5.5:1 on tint, 6.6:1 on white |
| routine     | \#F1F3F6 tint, ink-muted       | No hue. A plain grey label.                                                                | 6.5:1 on tint                 |
| ai-written  | \#F6F3EE                       | Panels holding AI-written text. A warm neutral, distinct from every class color.           | Ink on sand 13.1:1            |

The reference's own periwinkle (about \#6F8DF0) reaches only 3.1:1 on white and its typical light grey text about 2:1, so neither can carry text.

### Class identity

| **Class**   | **Color**           | **Shape**       | **Label and treatment**                                                         |
|-------------|---------------------|-----------------|---------------------------------------------------------------------------------|
| Routine     | None (neutral grey) | Outlined circle | “Routine”. Never in the queue; quiet row in history.                            |
| Authority   | Periwinkle          | Rounded square  | “Needs your signature”. Calm. A signature is expected, not a problem.           |
| Uncertainty | Amber               | Triangle        | “Needs interpretation”, plus the reason kind: Conflict, Missing or Unavailable. |
| Hard stop   | Red                 | Octagon         | “Blocked”. The only element in the product allowed to be red.                   |

Color intensity climbs with the amount of autonomy removed, so a glance down the queue reads as urgency.

### Provenance treatments

- **Rule output:** plain white surface, monospace rule ID, the facts it used.

- **AI-written:** warm sand panel, a dotted left edge and a label such as “AI-written · cites 3 sources”. Each cited evidence chip opens its source. Beside it, a small run label: Live, Recorded run (date, model) or Staged example.

- **Human decision:** plain surface with an ink left edge, naming the person, their role and the time.

### Type, surface and density

- **Type:** Inter for UI and data, a geometric sans such as Plus Jakarta Sans for headings and large numerals, monospace for IDs. Body 14px, tables 13px, nothing below 12px.

- **Surfaces:** white cards on the pale canvas, radius about 12px, soft shadow, 8px spacing grid. No zebra stripes; a hover tint on rows.

- **Density:** medium-high. Enterprise finance users read tables all day, so airy does not mean sparse.

### Components to build first

StatusBadge (four classes), AttentionRow, GateChecklist, EvidenceChip, AIBriefPanel, RuleCard (with a locked state), ConsequencePreview, GuardRefusal message, AuditEntry, VerificationForm, RoleSwitcher and a small RunLabel (Live, Recorded, Staged). SpotCheckCard follows in Phase 2. Build them on shadcn/ui with Radix Colors, as CSS-variable tokens. Cap the design-system work at two days and design the review screen first.

### Avoid

- Decorative shapes, rainbow icon tiles and floating action buttons.

- Red for anything except a hard stop.

- Light grey text, and any status that relies on color alone.

- The generic KPI-tiles-and-revenue-chart dashboard.

- The purple-gradient-and-sparkles look that currently marks anything AI.

## 13. What is real and what is simulated

| **Status**     | **Capability**                                                                                                                                                                                                                       |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Real**       | Rule records, rule engine and ruleset versioning.                                                                                                                                                                                    |
| **Real**       | State machine and permissions with enforced guards. An unauthorised transition is refused by the application, not hidden by the UI.                                                                                                  |
| **Real**       | Analysis packets, AI judgment on synthetic context, schema and evidence validation, fail-closed behaviour.                                                                                                                           |
| **Real**       | Class merge, gates, audit trail, correction scopes and the rule-change replay preview.                                                                                                                                               |
| **Simulated**  | Upstream extraction: synthetic structured records stand in for a real extractor.                                                                                                                                                     |
| **Simulated**  | ERP write-back, bank and payment execution (“Schedule payment” and the payment run change prototype state only), payment accounts and balances (two or three synthetic accounts), supplier contact and replies, enterprise identity. |
| **Simplified** | Production security, scale, retries and monitoring.                                                                                                                                                                                  |

**Demo controls** (development-only, not part of the product story): load a scenario fixture, reset the company, run payments now, simulate an unavailable source, mark evidence received, switch role, switch between live and recorded AI, change the display currency. The case study must label this as a concept and working simulation, not a deployed finance product.

## 14. Build decisions and open questions

### Proposed stack (change freely)

- **TypeScript throughout.** The rule engine, state machine, permissions and evidence validation live in a core package of pure modules with no UI imports and a full test suite.

- **SQLite** for the synthetic data, with resettable seed scripts.

- **React front end** (Next.js or Vite) with Tailwind and shadcn/ui.

- **AI module** calls the Claude API with structured output against a JSON schema. The model ID lives in config, and every AIRun stores the model and prompt version.

### Decided: demo mode

**Live by default on the genuine fixtures**, with a rate limit and a spend cap, and an **automatic fallback to the recorded run** if the limit is hit or the API fails. Every result carries its label (Live, Recorded run or Staged example, section 4), and the staged failures are always pinned. If a visitor's correction changes the AI's inputs and no recording matches, the analysis runs live; if that is not possible, the invoice fails closed to Uncertainty (Unavailable), exactly as the product would. There is no free-text invoice input from the public, which removes the injection and abuse surface. A recorded walkthrough video is a secondary asset.

### Decided: currency

USD is the base currency and every rule evaluates in it. A display-currency setting (USD, GBP or EUR) changes only how amounts are shown, using a fixed demo exchange rate displayed with its date. It never changes a threshold, a rule or a decision, and the rules screen always shows policy in USD. Invoices that arrive in another currency keep their original amount and are converted to USD at ingestion for rule evaluation (rule R09).

### Decided: payment accounts

Two or three synthetic bank accounts with balances, read-only. The review screen's consequence line shows the funding account and the balance after scheduled payments. There is no standalone accounts or cards page beyond the static integrations state, and cards are out of scope. An insufficient-funds rule (R12) is documented, not built.

### Decisions in this version that are open to challenge

- Queue order: hard stops pinned, then due date, then amount.

- No AI confidence score; similarity is computed in code.

- J4 (pattern anomaly) deferred to a later phase.

- Routine sampling is Phase 2 of the build and part of the case study (section 15).

## 15. Phase 2: routine sampling

Routine decisions never reach a human, so a quietly wrong one stays invisible until something goes wrong, which is exactly scenario 6. Sampling is the standard control for this in audit practice. It completes the supervision story: the AI is interrupted when it is unsure and sampled when it is confident. Phase 2 starts once the core has shipped, and it is part of the case study.

### How it works

- **Sampling.** Each week the system draws a small random sample of Routine decisions. The rate is a parameter, with a default of 5% and a minimum of three so the prototype always has something to review.

- **Where it appears.** A spot-check card on the home screen. Managers and the CFO review; Operators do not.

- **The review.** Each sampled invoice opens the same brief and evidence as a normal review, read-only, with two answers: confirm or flag.

- **A flag** opens the correction flow, pre-filled. The person chooses the scope, and the AI run receives a “missed” verdict. If a rule was at fault, the route is a rule-parameter correction.

- **No state change.** A sampled invoice stays Routine until flagged. A flagged one follows the reversal rules by timing: pulled back before the payment run, a recovery case after it.

- **Reporting.** A small summary shows sampled, confirmed and flagged counts and AI verdict counts. With synthetic data the figures are illustrative and labelled so. Staged examples are counted separately.

### Scenario 6, completed

In Phase 1 the duplicate is found by someone browsing recent activity and reporting a mistake. In Phase 2 a spot check can catch it instead. The case study shows both discovery routes and the same recovery flow behind them.

### Guardrails on the feature itself

- The sample is capped per week and items expire, so it cannot grow into a second backlog.

- Sampling only observes. It never changes an invoice's class or blocks a payment.

## 16. Definition of done and build sequence

### Definition of done, Phase 1

- All eight fixtures produce the expected rule floor and final class under test.

- Guard tests pass: every illegal transition in section 6 is refused, an AI failure fails closed, the AI cannot lower a class, and the injection fixture changes nothing.

- Each scenario can be completed end to end in the interface in under two minutes.

- A rule change shows its replay preview before it is saved.

- Every AI result is labelled Live, Recorded run or Staged example, and a failed run is logged differently from a judgment later marked wrong.

### Definition of done, Phase 2

- A sampled Routine decision can be confirmed or flagged by a Manager. A flag opens the correction flow and records the AI verdict.

- The scenario 6 miss can be discovered through a spot check as well as by browsing recent activity.

- The summary shows sampled, confirmed and flagged counts and AI verdict counts, with staged examples counted separately.

- A recorded walkthrough (a secondary asset) and a case study covering both phases that states which fixtures are staged.

### Build sequence: logic first

1.  Write the one-page policy and roster: the fictional company, roles, thresholds and supplier universe. This is mandatory, because rules, roles, scenarios and numbers drift apart without one source.

2.  Generate the schema from section 9: TypeScript types and the AI output JSON schema.

3.  Create the supplier, PO, invoice and payment-account seed data (in USD) and the eight fixtures, each with its expected outcome and its provenance label.

4.  Build the rule engine, state machine and permissions with tests. No interface and no AI yet.

5.  Build the analysis packets (similarity scoring, PO candidates) with tests.

6.  Add the AI module with evidence validation and fail-closed behaviour. Test it on the fixtures, including the injection attempt.

7.  Create the visual tokens and the twelve components, capped at two days.

8.  Build the screens: review detail first, then the attention queue, authority rules, and correction and recovery.

9.  Add the replay preview, correction flows and the verification form.

10. Test the scenarios with finance professionals: can a person understand why they were interrupted and decide safely in seconds?

11. Phase 2: build routine sampling (section 15), then run the scenario 6 walkthrough end to end.

12. Write the case study, covering both phases.

## 17. Portfolio story and scope

The strongest story is not “I added AI to accounts payable”. It is: **I designed how a finance manager safely delegates routine work to AI while keeping control of risk, authority and mistakes.** The design decisions worth featuring:

- The split between rules and AI, and the test used to draw it.

- Code retrieves and calculates, the AI interprets, and nothing the AI says about its own confidence changes routing.

- Escalate-only, and fail closed: when the AI fails, a person sees the invoice.

- One verification path serving two hard-stop triggers, with two-person confirmation.

- Gates that are derived from facts, so nobody can tick their way past a risk.

- Locked rules, and a consequence preview before any rule changes.

- Correction with an explicit scope instead of silently “teaching” the AI.

- Honest handling of AI failure in both directions: a miss and a false alarm.

- Two kinds of AI failure kept apart: a technical failure is logged at once, while a bad judgment is only known later and is annotated, never edited.

- Routine sampling as the detection control for quietly wrong autonomous decisions.

- Honest labelling of every AI result as Live, Recorded or Staged.

**Validation plan:** scenario-based usability testing with finance professionals. No invented production metrics.

**Out of scope:** invoice extraction, real bank transfers, full ERP functionality, a tax or accounting engine, production security and compliance, multi-country finance rules. If a feature does not strengthen the human-supervision story, cut it.

## Appendix: screens, parked

Screen design starts once the logic is settled. This table records only what each screen needs from the logic, so the two stay aligned.

| **Screen**                  | **What it needs from the logic**                                                                                                                                                                                                                                                                                                   |
|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Home**                    | Counts per class, the top five in smart order grouped in bands (Hard stops, Overdue, Due this week, Later) and, in Phase 2, a spot-check card. Not sortable.                                                                                                                                                                       |
| **Attention queue**         | Class, primary reason with “+N more”, kind, due date, amount and proposed action, in the smart order of section 3, with sorting, filtering, group-by and “reset to smart order”. Hard stops stay pinned. Must separate “AI is unsure” (Uncertainty) from “AI lacks authority” (Authority).                                         |
| **Review detail**           | The gate checklist, the AI brief with evidence chips and its run label (Live, Recorded or Staged), rule results, the extracted record, and the consequence of each available action: the state-machine result, the funding account and the balance after scheduled payments. Actions derive from the guards and the viewer's role. |
| **Authority rules**         | Rule records, editable parameters, locked flags, rule history, supplier-scoped parameters and the replay preview.                                                                                                                                                                                                                  |
| **Correction and recovery** | The audit record, whether the transition is still reversible, the four scope options with a preview of affected open invoices, the AI verdict (confirmed, false alarm or missed) and recovery cases.                                                                                                                               |
| **Supporting (kept light)** | History, supplier context, the verification form and integration status appear only as embedded or static states, never as core builds.                                                                                                                                                                                            |

