# Phase 8 — Plan Check Verdict

**Verdict:** BLOCK — revise plans before execution.
**Date:** 2026-05-13
**Plans audited:** 08-00 through 08-04 (5 plans, 17 tasks)
**Methodology:** Goal-backward + schema reality check + cross-plan contract audit.

---

## Executive Summary

Five plans, 17 tasks, ~280 KB of structured planning. The wave ordering is sound, the propose-and-confirm reuse is correct, and the Phase 2 optimistic-lock pattern is honoured. **However, the plan set contains four blockers that will prevent Phase 8 from achieving its goal as written**, plus three serious warnings and several smaller items.

**The core problem:** Wave 1 plans to *create* a `NotificationDelivery` Prisma model that **already exists in the schema** with a materially different shape — this will fail `prisma migrate dev`. Wave 1's payroll/bank-file path also assumes `Driver.contractedRateKd` and `Driver.iban` columns that **do not exist** in `schema.prisma`. These are not cosmetic: payroll cannot be computed, bank files cannot be generated, and the migration step will not run.

**Recommendation:** Revise 08-01 and 08-03 plans (Wave 1 schema + payroll path), then proceed.

---

## Coverage — REQ-IDs

ROADMAP Phase 8 requirements line: `REQ-finance-cash-workbench, REQ-finance-payroll, REQ-finance-invoices, REQ-finance-expenses-pl, REQ-agent-action-tools` (5 reqs).

| REQ-ID | Plans claiming coverage | Tasks delivering it | Status |
|--------|------------------------|---------------------|--------|
| REQ-agent-action-tools | 08-00, 08-01, 08-02, 08-04 | 08-01 T2 (8 tools), 08-01 T3 (projector), 08-04 T1 (REVERSERS), 08-04 T2 (audit refactor) | COVERED |
| REQ-finance-cash-workbench | 08-00, 08-02 | 08-02 T1 (recon service + route), 08-02 T2/T3 (UI) | COVERED |
| REQ-finance-payroll | 08-00, 08-03 | 08-03 T1 (computer + exporter), 08-03 T2 (route), 08-03 T3 (UI) | **COVERED-CONDITIONAL** — payroll task assumes `Driver.contractedRateKd` and `Driver.iban` which do not exist (BLOCKER B2). Behaviour at runtime will fail. |
| REQ-finance-invoices | 08-00, 08-03 | 08-03 T1/T2 (pnlAggregator includes Invoice), 08-03 T2 (route), 08-03 T3 (UI) | COVERED |
| REQ-finance-expenses-pl | 08-00, 08-03 | 08-03 T1 (pnlAggregator), 08-03 T2 (routes), 08-03 T3 (UI) | COVERED |

All 5 REQs appear in at least one plan's `requirements` frontmatter and have implementing tasks. The dimension PASSES, conditional on B2 being resolved.

---

## Dependencies & Wave Order

| Plan | Wave | depends_on | Verdict |
|------|------|-----------|---------|
| 08-00 | 0 | [] | OK |
| 08-01 | 1 | [08-00] | OK |
| 08-02 | 2 | [08-01] | OK |
| 08-03 | 3 | [08-02] | OK |
| 08-04 | 4 | [08-03] | OK |

Strictly sequential, no cycles, no forward refs. Red-tests-before-code discipline upheld throughout — every Wave-1+ task names which Wave-0 RED test it turns GREEN. PASS.

---

## Goal-Backward Reading

Phase 8 promises two outcomes:

1. **Audit-only tools promoted to live.** Tools `applyPenalty`, `suspendDriver`, `reassignShift`, `recordCashSettlement`, `sendCourierMessage`, `createTrainingTask`, `escalateToHumanSupervisor`, `generatePayrollAdjustment` go from "audit row only" to "real side effect + audit row." → **08-01 T2 ships all 8 + propose-confirm continuity via PHASE_8_LIVE_TOOLS in T3.** Conceptually intact.

2. **Finance Workbench UI surface.** Cash (3 platforms, no Americana), Payroll, Invoices (4 platforms), Expenses & P&L, History/Rollback. → **08-02 ships Cash; 08-03 ships Payroll + Invoices + Expenses + P&L; 08-04 ships History + per-tool rollback dispatch.** Conceptually intact.

If every task executed correctly, the phase goal would be achieved — but executability is blocked by B1-B4 below.

---

## BLOCKERS (must fix before execution)

### BLOCKER B1 — `NotificationDelivery` collision: Wave 1 will fail to migrate
**Where:** `08-01-PLAN.md` Task 1 (`<interfaces>` block, lines 248-264 of the plan) declares a NEW `NotificationDelivery` model with FK `notificationId` → `Notification` and fields `attemptCount`, `lastError`, `deliveredAt`, plus the status enum `QUEUED | SENT | DELIVERED | FAILED | CANCELLED`.

**Reality (verified `backend/prisma/schema.prisma:1688-1712`):** `NotificationDelivery` **already exists** with a completely different shape:
- `channel: NotificationChannel` (existing enum WHATSAPP|EMAIL|SMS, no IN_APP)
- `recipient: String`, `body: String`, `subject: String?` (no `notificationId` FK)
- `provider: String?`, `idempotencyKey: String? @unique`, `attempts: Int`, `lastAttemptAt`, `sentAt`, `error`
- `sourceType: String?`, `sourceId: String?`
- `status: NotificationDeliveryStatus` (existing enum `QUEUED | SENDING | SENT | FAILED | DEAD`)

**Impact:** Wave 1 Task 1 says "9 new models added (additive — no existing model modified)." Re-declaring `NotificationDelivery` from scratch will fail `prisma migrate dev` with a duplicate-model error. The migration verification gate (truth #13) will not pass; Wave 1 stops there.

**Knock-on damage:**
- `sendCourierMessage.ts` (08-01 Task 2 §5) is designed against the wrong schema. It plans to write `{tenantId, notificationId, channel:'WHATSAPP', status:'QUEUED'}` to a non-existent column set. It must instead write to the existing columns: `recipient` (driver phone), `body` (the message text), `channel: 'WHATSAPP'`, `status: 'QUEUED'`, optional `idempotencyKey`.
- `REVERSERS.sendCourierMessage` (08-04 Task 1 lines 405-425) reads `(audit.originalProposal as any)?.deliveryId` and flips `notificationDelivery.status -> CANCELLED`. The status flip is fine because `NotificationDeliveryStatus` already has the broader set, but **`CANCELLED` is NOT in the existing `NotificationDeliveryStatus` enum** (existing set is `QUEUED|SENDING|SENT|FAILED|DEAD`). This will fail TypeScript compilation as well as the Prisma runtime check.
- The Wave 0 RED test for `sendCourierMessage` (`08-00 Task 1 §5`) asserts an enqueue shape that doesn't match the existing model. The test author will either pass an incorrect schema or have to fight Prisma types.

**Fix paths (planner must pick one):**
1. **Reuse the existing model.** Drop the Wave 1 NotificationDelivery additions. Update `sendCourierMessage.ts` to write `{recipient, body, channel:'WHATSAPP', status:'QUEUED', idempotencyKey, sourceType:'agentRunId', sourceId:audit.agentRunId}`. Add `CANCELLED` to the existing `NotificationDeliveryStatus` enum (still purely additive — Phase 9 worker can ignore it). Update 08-04 reverser accordingly.
2. **Rename the new model** (e.g., `AgentMessageQueue`) to avoid the collision. More disruptive but keeps the per-notification linkage. Requires updating every reference in 08-00 / 08-01 / 08-04.

Option 1 is cheaper and uses the model the codebase already validates against.

**Severity rationale:** This is a blocker because Wave 1 cannot ship Task 1 (truth #13 fails) which cascades to every downstream wave.

---

### BLOCKER B2 — Payroll path references columns that do not exist on `Driver`
**Where:**
- `08-03-PLAN.md` Task 1, `payrollComputer.ts` code block (around line 360): `prisma.driver.findFirst({ ..., select: { id: true, contractedRateKd: true } })` and then `const rate = new Prisma.Decimal(driver.contractedRateKd ?? 0)`.
- Same task: `buildPayrollRun` selects `iban: true` from Driver (line ~432) and writes it to `PayrollLine.iban`.

**Reality (verified `backend/prisma/schema.prisma:490-578`):** The `Driver` model has `monthlySalary Float?` and zero references to `contractedRateKd` or `iban`. The pay rate, if any, lives in `monthlySalary`. The driver bank-account number is **not stored anywhere** in the existing schema (verified by full grep: `grep -nE "iban|IBAN" prisma/schema.prisma` returns nothing).

**Impact:**
- `payrollComputer.test.ts` (08-00 truth #14) asserts `base = Driver.contractedRateKd × actualHoursMinutes/60`. The test cannot pass — the column doesn't exist; Prisma will reject the `select` at type-check time.
- `bankFileExporter.ts` (08-03 Task 1 step 3) writes `csv = { iban: line.iban ?? "", ... }`. The Wave 1 `PayrollLine.iban` column DOES exist in the new model, but it will always be `null` because the source (`Driver.iban`) doesn't exist. Bank files will export `,X.XXX,RUN-...` with empty IBANs — accountant cannot pay anyone.
- The Wave 0 RED test author has no choice but to either skip these fields, hand-roll a stub `Driver.contractedRateKd` value, or invent a different rate source.

**Fix paths:**
1. **Extend `Driver` model.** Wave 1 Task 1 currently states "Do NOT modify any existing column." That guard rail needs an exception for two additive columns:
   ```prisma
   contractedRateKd  Decimal? @db.Decimal(10, 3)
   iban              String?
   ```
   Both nullable + new = still purely additive.
2. **Reuse `Driver.monthlySalary`.** Rewrite `computeWeeklyPay` to derive a weekly rate from `monthlySalary / 4.333` (or `monthlySalary / weekly-hours-target`). Founder-gateable. But this still leaves IBAN unsourced — for IBAN, option 1 is the only viable answer unless Phase 8 punts payroll export to Phase 9.
3. **Founder-gate.** Mark Wave 3 Task 1 payroll computation as `BLOCKED — pending Driver column additions` and ship Cash workbench + Invoices + Expenses + P&L + Action Tools only. The phase still delivers 4 of 5 REQs but `REQ-finance-payroll` slips to Phase 8.1.

Option 1 is the smallest fix. Currently the plans imply column existence without ever adding them — that's the gap.

**Severity rationale:** REQ-finance-payroll is in Phase 8's roadmap line and Phase 8's must_haves. Payroll cannot ship without these two columns. Either add them or formally defer the requirement.

---

### BLOCKER B3 — Self-acknowledged Wave 1 truths-vs-interfaces inconsistency
**Where:** `08-01-PLAN.md` `must_haves.truths` (line 28) and `must_haves.artifacts` (line 41-42) say **"7 new models"** in one breath and **"9 new Prisma models"** in the next. The actual `<interfaces>` block lists 9 models (NotificationDelivery, TrainingTask, PayrollRun, PayrollLine, PayrollAdjustment, Invoice, InvoiceLine, Expense, BankFile).

Specifically:
- Truth 1: `"Prisma schema gains 7 new models — NotificationDelivery, TrainingTask, PayrollRun, PayrollLine, PayrollAdjustment, Invoice, InvoiceLine, Expense, BankFile — all tenant-scoped"`. That's 9 names listed under the heading "7 new models."
- Artifact: `"9 new Prisma models added"` — correct count.
- `<objective>` block: `"adds 9 new models"` — correct count.

**Impact:** Executor confusion. A literal reader of truth #1 might omit two of the nine. Verifier checking the count will see contradiction. The Task 1 `<verify><automated>` block actually asserts `wc -l == 9`, so the failure would surface — but a careful planner shouldn't leave the contradiction in the spec.

**Fix:** Change `must_haves.truths[0]` from "7" to "9". One word edit.

**Severity rationale:** The verify command checks 9, the artifact count is 9, but the truth narrative says 7. A confused executor could push a partial PR; a careful one will spot the discrepancy after wasted reads. Blocker because the plan's own self-assessment flagged this and it remains uncorrected.

---

### BLOCKER B4 — Phase 2 `promptRegression.test.ts` will fail when Wave 1 Task 4 updates `monitor.md`
**Where:**
- Phase 2 test file `backend/src/__tests__/agent/monitor/promptRegression.test.ts:187-197`:
  ```js
  test("forbiddenToolNames includes applyPenalty and suspendDriver across ALL gold fixtures...", () => {
    for (const f of GOLD_FIXTURES) {
      if (f.expect.minProposals === 0) continue;
      expect(f.expect.forbiddenToolNames).toContain("applyPenalty");
      expect(f.expect.forbiddenToolNames).toContain("suspendDriver");
    }
  });
  ```
- The fixtures themselves are gold-set files Phase 2 shipped. They assert that the monitor's prompt has `applyPenalty` and `suspendDriver` in the *forbidden* list.
- `08-01-PLAN.md` Task 4 explicitly addresses this conflict and proposes to *leave the forbidden list alone* and only add to the "Available tools" section. It says: "the easiest path is to leave `monitor.md`'s forbiddenToolNames assertion alone and let Phase 11 update both the prompt AND the Phase 2 fixture in lockstep."

**Why this is still a blocker, not a warning:** The phase goal says all 10 action tools must be callable from the monitor (`REQ-agent-action-tools` lists `applyPenalty(...)`, `suspendDriver(...)`, ...). If the monitor's prompt continues to forbid them, the monitor agent **will not propose them**, which means:
- `08-01 T3` promotes them to "live" in cardProjector, but…
- …no monitor agent will ever surface them on `/decisions`. The propose-and-confirm pipeline lights up the Approve button for proposals that never arrive.
- The cards CAN still arrive via the `chat` agent (which has `allowedAgents: [...,'chat']`) or `triage` or `reconciliation`, so the live tools are technically reachable through `/api/decisions/:id/approve`. But the monitor — which is the ritual surface — won't propose them.

**Impact:**
- Phase 8 ships visibly half-broken: the moat tools exist but the daily anomaly scanner (the monitor) doesn't propose them. Operators have to use chat to fire penalties — degrades the morning ritual.
- 08-01 T4's verify command also gates on `npm test -- promptRegression` exiting 0. As written, the planner says "leave the prompt alone, the test stays green." That's only true if the planner is OK with the monitor not proposing the 7 new tools. The plan contradicts itself: T4's action says "add to available tools list so the monitor knows it can propose" while the gold-set test asserts the monitor must *not* propose them.

**Fix paths:**
1. **Update gold fixtures in Wave 1.** Remove `applyPenalty` and `suspendDriver` from `forbiddenToolNames` in the relevant fixture files; update the gold-set snapshot. This is "touching Phase 2 tests" but it is exactly the right scope for a phase that promotes those tools.
2. **Update the Phase 2 test assertion.** Change `expect(...).toContain("applyPenalty")` to a phase-gated check (e.g., `if (PHASE_8_LIVE_TOOLS_AVAILABLE) expect(...).not.toContain("applyPenalty"); else expect(...).toContain("applyPenalty")`).
3. **Split the work.** Ship 7 tools as "callable but unforbidden" in Wave 1 prompt + update gold fixtures in the same wave. Document the gold-set update in 08-01-SUMMARY.md.

Whichever path the planner chooses, the current "leave alone, no behaviour change" stance contradicts the goal of having the monitor propose these tools.

**Severity rationale:** This is a goal-completion blocker. Without monitor-side proposal, the moat tools are reachable only through chat — the propose-and-confirm pipeline that the phase advertises is half-functional. The plan must pick a path explicitly.

---

## WARNINGS (should fix; execution can continue)

### WARNING W1 — `NotificationDeliveryStatus.CANCELLED` not in enum
**Where:** `08-04-PLAN.md` Task 1 `REVERSERS.sendCourierMessage` flips status to `"CANCELLED"`. Existing enum: `QUEUED | SENDING | SENT | FAILED | DEAD`.

**Fix:** Add `CANCELLED` to `NotificationDeliveryStatus` enum in Wave 1 schema additions (purely additive). Or use `DEAD` for rolled-back delivery (less semantic but works).

This is also implicit in BLOCKER B1's resolution path.

### WARNING W2 — `flagForReview` promoted to live but no body change
**Where:** `08-01-PLAN.md` Task 3 explicitly notes: `flagForReview` is in `PHASE_8_LIVE_TOOLS`, so its Approve button is enabled, **but the execute body remains a no-op audit-only stub**. The plan flags this as "smallest-step promotion path."

**Impact:** Users will click Approve and see "success" but nothing will happen. This contradicts the Phase 8 success criterion #5 which says "each writes a CON-audit-row-shape compliant row to `AgentAction` on Approve" — the audit row will be written but the operator-visible effect (flagging the driver for human review) is missing.

**Fix:** Either ship `flagForReview` with a real body (e.g., create a Notification with category="OPS_TODO" + severity="MEDIUM" targeted at SUPERVISORs) in Wave 1 Task 2, or remove `flagForReview` from `PHASE_8_LIVE_TOOLS` so the projector keeps the Approve button disabled until Phase 11. Half-ship is the worst option.

### WARNING W3 — Wave 3 P&L revenue source assumes `Invoice` rows exist; nothing in Phase 8 populates them
**Where:** `08-03-PLAN.md` Task 1 `pnlAggregator.ts`: `revenue = sum(Invoice.totalKd) by platform`. Wave 1 ships the `Invoice` schema. Wave 3 ships the read route. **No Wave anywhere creates Invoice rows.**

**Impact:** P&L revenue numbers will all be `0.000` until a separate phase (or a backfill script) populates `Invoice`. The accountant will look at the P&L screen and see expenses but zero revenue. This is technically delivering "the route exists" but not "the report is correct."

**Fix paths:**
1. Add a Wave 3 task: scaffold an `POST /api/finance/invoices` (and/or `POST /api/finance/invoices/import` XLSX route) so accountant can hand-enter invoices for the dry-run.
2. Document this gap in `08-03-SUMMARY.md` and the Phase 8 verification report as a known-empty state.
3. Pre-seed invoices via the existing CashRecord → derive revenue from CashRecord.collectionAmount (changes the data semantics but P&L would show real numbers).

Wave 3 frontend `/finance/invoices` page exists but it's read-only (table + reconcile). It does not let accountant *create* invoices. This means the screen will be empty until ingestion exists.

### WARNING W4 — `applyPenalty` ACCOUNT_SUSPENSION cascade duplicates `suspendDriver`
**Where:** `08-01-PLAN.md` Task 2 §1 says `applyPenalty` with `penaltyType=ACCOUNT_SUSPENSION` performs the full cascade (Driver.update + Shift.updateMany + DriverRestriction.create) inline. The same plan ships a separate `suspendDriver.ts` that does exactly this cascade.

**Risk:** Two write paths to the same effect → divergence over time. One day someone updates `suspendDriver` to also email the supervisor; the cascade inside `applyPenalty` won't get the update.

**Fix:** Inside `applyPenalty.execute`, when `penaltyType=ACCOUNT_SUSPENSION`, **delegate** to `suspendDriver.execute(ctx, {driverId, durationDays, reason})` rather than re-implementing. RESEARCH.md's anti-patterns section says don't bifurcate. The plan currently bifurcates.

This is feasible: registry tool refs are imports, and `suspendDriver.execute` is just a function. Calling it from inside `applyPenalty.execute` inside its `$transaction` is the cleanest way. (But note: nested `prisma.$transaction` needs care — pass the `tx` delegate, or refactor `suspendDriver` to accept an optional tx.)

### WARNING W5 — `recordCashSettlement` rollback gate is in the dispatcher only, not the route
**Where:** `08-04-PLAN.md` says the route uses `REVERSERS[audit.toolName]` and `auditWindowOk()`. The `auditWindowOk` function returns `false` for `recordCashSettlement` (window=0 sentinel), so the route returns 409 "Rollback window expired or operation not permitted." But the dispatcher's `REVERSERS.recordCashSettlement` THROWS "Cash settlement rollback requires accountant manual reversal."

**Risk:** Two error paths, one error message. If a tester writes `expect(res.body.error).toContain('Cash settlement')` they will fail because the actual error is "Rollback window expired or operation not permitted." The 08-00 RED test for this case (`auditRollback.phase8.test.ts` truth: `"400 'Cash settlement rollback requires accountant manual reversal'"`) will fail against the actual code.

**Fix:** Either:
1. Remove the `windowOk=0` sentinel for cash and let the reverser throw (matches the RED test).
2. Update the RED test assertion to match the route's 409 message.

The plan as written will produce a 409 with "Rollback window expired…" — the operator-facing message is less informative than the dispatcher's throw. Option 1 (let the reverser throw) is clearer.

### WARNING W6 — Wave 1 schema migration "fall back to hand-crafted SQL" path is speculative
**Where:** `08-01-PLAN.md` Task 1 says: "If `prisma migrate dev` fails because of the pre-existing DI-01-02 baseline defect, fall back to hand-crafted SQL migration mirroring the Phase 1 / Phase 2 hand-crafted pattern." The plan does not state what the SQL would look like, nor commit to a specific migration filename, nor reference the actual DI-01-02 ticket.

**Risk:** Executor reaches the fallback path and has to design the SQL on the spot. Hand-crafted SQL for 9 new tables + relations + indexes is non-trivial. The plan should either ship a pre-written SQL fallback file in Wave 0 or commit to `prisma migrate dev` and treat its failure as a blocker that escalates to the founder.

**Fix:** Add a Wave 0 Task 5: write the fallback SQL in advance and stage it under `backend/prisma/migrations/<TIMESTAMP>_add_phase_8_finance_models/migration.sql` so it is review-ready before Wave 1 starts. If `prisma migrate dev` succeeds, the file gets regenerated; if it fails, the file is the fallback.

### WARNING W7 — Wave 3 incentive column is a `TODO`
**Where:** `08-03-PLAN.md` Task 1 `payrollComputer.ts`: `const incentives = new Prisma.Decimal(0);  // TODO: replace with real incentive source post-schema verification`.

**Impact:** Payroll lines will show `incentives: 0.000` for every driver, regardless of bonuses earned. Wave 0 test `payrollComputer.test.ts` truth #3 says incentives "sum Shift.bonus-or-equivalent during the window (use schema-actual column name; verify against schema.prisma during Wave 0 read)" — but the Wave 0 plan does not commit to which column. The TODO ships to production.

The schema has `Shift.plannedHoursMinutes`, `Shift.actualHoursMinutes`, no incentive column on Shift. There IS a `CourierIncentivePayout` model (line 567 of Driver back-relations). Wave 3 should source from that model.

**Fix:** Resolve the incentive source before Wave 3 Task 1 starts. Either set incentives to 0 with a clear comment (and update the RED test to expect 0), or wire it through `CourierIncentivePayout`. A literal `TODO` in shipped code is a smell.

### WARNING W8 — `escalateToHumanSupervisor` 25-recipient cap may be too low for some tenants
**Where:** `08-01-PLAN.md` Task 2 §7 caps fan-out at 25 SUPERVISOR users. Threat T-08-W1-06's mitigation explicitly says "typical fleet has <10 supervisors; cap covers outliers."

**Impact:** A larger tenant (e.g., 30-supervisor multi-region operator) silently misses 5 supervisors per escalation. The plan logs a warning but the operator never sees it.

**Fix:** Either make the cap a `Tenant.escalationFanoutCap` column (defaults to 25), or surface a UI warning when fan-out is truncated. Low priority; can defer to Phase 11.

---

## NITS (cosmetic)

### NIT N1 — `must_haves.truths` cross-wave count assertions
Several plans claim "X new files" in the truths block where X is computed by hand; mismatches between truth #N and the `files_modified` list will cause confusion. Recommend dropping numeric assertions from truths and letting the file list be the source of truth.

### NIT N2 — Wave 1 promotion of `flagForReview` referenced as Phase 8 promotion but Phase 8's monitor.md prompt update doesn't include it
`08-01-PLAN.md` Task 4 lists 7 tool names to add to `monitor.md` (applyPenalty, suspendDriver, reassignShift, createTrainingTask, recordCashSettlement, escalateToHumanSupervisor, generatePayrollAdjustment, sendCourierMessage = 8 names) but the truth says "7 new tools." The list in the action body is 8 lines. Counting is off by one because `sendCourierMessage` is sometimes classed as "Phase 2 audit-only being promoted" and sometimes as "Phase 8 new." Pick one taxonomy.

### NIT N3 — `08-04-PLAN.md` window thresholds for `draftCourierMessage` use a fractional day
`WINDOW_DAYS.draftCourierMessage = 5 / (60 * 24)` (= ~0.00347). Works but floating-point comparison against an age in ms then converting back is fragile. Recommend store thresholds in milliseconds directly, or split into `WINDOW_MS: Record<string, number>` with sentinel `-1` for entity-state checks.

### NIT N4 — Login redirect util in Wave 2 may collide with Phase 2 login flow
`08-02-PLAN.md` Task 2 says: "If an existing login flow already exists at `frontend/src/app/(auth)/login/...`, update that path to call `computePostLoginRedirect(user.role)`. If unsure, leave the existing login redirect alone and ship `loginRedirect.ts` as a util — Wave 4 can wire it once founder confirms." This is a soft punt — Wave 2 ships a helper that isn't called. The accountant won't actually land on `/finance/cash` until Wave 4 (or never). Consider hard-wiring it in Wave 2 or deferring the util entirely.

---

## Architectural Consistency Check

- **`authMiddleware + tenantScope` on every new route:** OK across 08-02 T1 (cash recon), 08-03 T2 (4 finance routers — all use `router.use(authMiddleware, tenantScope)` per the existing `cash.ts` pattern). PASS.
- **`prisma.$transaction` wrapping multi-write tools:** Confirmed in 08-01 Task 2 for `applyPenalty` (cascade), `suspendDriver` (3 writes), `recordCashSettlement` (2 writes), `createTrainingTask` (single — no tx needed), `escalateToHumanSupervisor` (N writes — should wrap), `generatePayrollAdjustment` (single + read — should wrap to be safe). 08-01 Task 2's verification step counts $transaction occurrences. PASS.
- **Optimistic-lock pattern preserved:** 08-01 inherits the Phase 2 `/api/decisions/:id/approve` route unchanged; 08-03 Task 2 uses `updateMany({where: {id, tenantId, status: 'DRAFT'}})` for the payroll freeze (correct optimistic-lock idiom). PASS.
- **`lint:tenant` glob extension:** 08-00 Task 4 extends the script with `src/services/finance/`, `src/routes/financePayroll.ts`, etc. The action body says "preserve EVERY existing glob verbatim" — good. The verify step grep-checks the new entries. PASS.
- **Decimal-safe arithmetic:** Plans repeatedly use `new Prisma.Decimal(...)` and `.toFixed(3)`. 08-03 `payrollComputer.ts` constructs Decimal from `driver.contractedRateKd ?? 0` — once the column exists (B2), this is safe. PASS conditional on B2.

PASS overall, conditional on blockers.

---

## Pitfalls from RESEARCH.md — coverage matrix

| Pitfall | RESEARCH.md ref | Plan coverage | Status |
|---------|----------------|---------------|--------|
| Dual-approval race (T-02-14) | Pitfall 1 | 08-00 T1 ships `dualApproval.phase8.test.ts`; 08-01 inherits Phase 2's `pendingAgentAction.updateMany({where:{id, resolvedAt:null}})` verbatim | COVERED |
| Penalty double-apply via manual route | Pitfall 2 | NOT COVERED — no plan adds `@@unique([violationId, penaltyType])` or gates `POST /api/penalties` against `proposedActionId`. **Open gap.** |
| Cash rollback corruption | Pitfall 3 | 08-04 T1 `REVERSERS.recordCashSettlement` throws "manual reversal required"; warning W5 above notes the route-level path | COVERED-WITH-CAVEAT (W5) |
| Suspension/shift cascade gap | Pitfall 4 | 08-01 T2 §2 cascade inside `$transaction`; cascade integration test in 08-00 (truth #3) | COVERED |
| Audit-only → live cutover surprise | Pitfall 5 | Mentioned in 08-01 plan rationale BUT **no migration ships** to mark stale `PendingAgentAction` rows as `resolution="rejected"`. RESEARCH.md (lines 401-403) recommends a Wave 1 migration: `UPDATE pendingAgentAction SET resolution='rejected', overrideReason='Phase 8 cutover...' WHERE toolName IN (...) AND resolvedAt IS NULL AND createdAt < deployment_date`. The Wave 1 plan does not include this. **Open gap.** |
| Tenant-guard regression on finance routes | Pitfall 6 | 08-00 T4 extends `lint:tenant` glob to cover `services/finance/` + `routes/finance*.ts`. PASS. |

**Two pitfalls underspecified:**

- **Penalty double-apply (Pitfall 2)** — `POST /api/penalties` continues to exist (Phase 1 route). If accountant uses both surfaces for the same violation, penalty is applied twice. No plan adds the unique constraint or the idempotency gate.
- **Audit-only cutover (Pitfall 5)** — stale Phase 2 `PendingAgentAction` rows with `toolName='proposeCashReminder'` or `flagForReview` and `resolvedAt IS NULL` will, after Phase 8 deploys, fire real side effects on Approve. The accountant clicking Approve on a 3-week-old card will be surprised. Wave 1 must ship a backfill migration to mark these as `rejected`.

Recommend adding a Wave 1 task: ship a one-shot SQL script or a Prisma transaction (`prisma.pendingAgentAction.updateMany({where: {toolName: {in: [...]}, resolvedAt: null, createdAt: {lt: phase8DeployDate}}, data: {resolvedAt: new Date(), resolution: 'rejected', overrideReason: 'Phase 8 cutover — tool semantics changed'}})`).

---

## AMERICANA SQL-level exclusion check

- **Cash:** 08-02 Task 1 `reconciliation.ts` line `where: { tenantId, status: ..., ...(platform ? { driver: { platform } } : { driver: { platform: { not: "AMERICANA" } } })}`. Route handler rejects `?platform=AMERICANA` with 400. Frontend `PlatformFilterPills.tsx` omits Americana. PASS — exclusion is at the SQL level (not the projection layer).
- **Invoices:** 08-03 Task 2 `financeInvoices.ts` lists across all 4 platforms; frontend `InvoiceTable.tsx` includes Americana tab. PASS — Open Question #3 resolution honoured.
- **Payroll:** No platform filter on payroll computation — drivers of any platform get a PayrollLine. Open Question #3 says "Americana drivers do get paid" — PASS.
- **P&L:** Aggregator iterates `PLATFORMS = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"]` for revenue rollup. PASS.

PASS across all four surfaces.

---

## Nyquist Compliance (validation architecture)

Wave 0 RED tests cover every Wave 1+ tool, service, and route. Each later task names its Wave 0 RED test in `read_first`. Each `<verify><automated>` block runs that test and checks GREEN. Sampling: every Wave 1-4 task carries at least one `<automated>` verify step. PASS.

One soft observation: the `bankFileExporter.test.ts` perf assertion (`300-row run streams in <500ms`) runs in CI where memory/IO is variable. Treat any single failure as a flake before declaring the implementation slow.

---

## CLAUDE.md compliance

- TypeScript strict — all new files spec'd to compile under `tsc --strict`. PASS.
- Prisma everywhere — `pnlAggregator.ts` uses `prisma.groupBy` instead of raw SQL (research had suggested `$queryRaw`; plan opted for groupBy which is the CLAUDE.md-preferred path). PASS.
- `authMiddleware + tenantScope` on every route — confirmed across 08-02 + 08-03. PASS.
- Pagination via `getPagination()` / `paginatedResponse()` — 08-03 plans rely on existing helpers. Acceptable.
- Try/catch + `{error: msg}` return shape — 08-02 + 08-03 plans use the pattern. PASS.
- Tailwind / Shadcn / Lucide on frontend — 08-02 + 08-03 + 08-04 component samples use Sierra palette tokens and Lucide icons. PASS.

PASS.

---

## Final Recommendation

**BLOCK** the execution path. Return to planner with:

1. **B1 — Resolve `NotificationDelivery` collision** (one-line model decision, plus update to `sendCourierMessage`, the Wave 0 test fixture, and 08-04 reverser).
2. **B2 — Resolve `Driver` payroll columns** (add `contractedRateKd Decimal? @db.Decimal(10,3)` and `iban String?` to Driver model, OR formally defer `REQ-finance-payroll` to a follow-up phase).
3. **B3 — Correct the "7 vs 9 new models" count in 08-01 truth #1.**
4. **B4 — Pick a path for monitor `forbiddenToolNames`** (update gold fixtures and prompt in lockstep, or accept that the monitor will not propose the 7 new tools — and document this as a known v1 gap).

Recommended additional fixes before re-verification:
- W1 — add `CANCELLED` to `NotificationDeliveryStatus` enum (folds into B1's resolution)
- W2 — decide `flagForReview` body (live or stay audit-only)
- W3 — scaffold an Invoice ingest path or document the empty-P&L state
- Pitfall 5 — add Wave 1 backfill migration for stale `PendingAgentAction` rows
- W5 — align cash-rollback error path between route window check and reverser throw

The plan structure is solid and the wave order is correct. The blockers are concrete and fixable in a single revision cycle. Most issues stem from schema drift between when RESEARCH.md was sketched and where `schema.prisma` actually stands today — a focused re-read of `Driver` (lines 490-578) and `NotificationDelivery` (lines 1688-1712) by the planner should close them quickly.

---

## Appendix — file paths referenced

Schema reality:
- `backend/prisma/schema.prisma:490-578` — Driver model (no contractedRateKd, no iban)
- `backend/prisma/schema.prisma:676-718` — Shift model (has both date and scheduledStart)
- `backend/prisma/schema.prisma:1659-1683` — Notification model
- `backend/prisma/schema.prisma:1688-1712` — **existing NotificationDelivery model**
- `backend/prisma/schema.prisma:1714-1726` — NotificationDeliveryStatus enum (no CANCELLED)
- `backend/prisma/schema.prisma:2226-2298` — PendingAgentAction + AgentAction

Phase 2 contracts inherited:
- `backend/src/routes/decisions.ts:344-356` — optimistic-lock approve claim
- `backend/src/routes/audit.ts:160-248` — Phase 2 rollback (to be refactored in 08-04)
- `backend/src/services/decisions/cardProjector.ts:109-111` — PHASE_2_LIVE_TOOLS
- `backend/src/__tests__/agent/monitor/promptRegression.test.ts:187-197` — gold-fixture forbiddenToolNames assertion (B4)
- `backend/src/agent/registry.ts:31, 85, 137` — allowedAgents gate
- `backend/src/agent/runtime.ts:13` — AgentId type
- `backend/package.json:17` — lint:tenant script

Phase 8 plan files audited (all under `.planning/phases/08-finance-workbench/`):
- `08-00-PLAN.md` — Wave 0 RED scaffold (28 tests)
- `08-01-PLAN.md` — Wave 1 schema + 8 tools + projector + prompts
- `08-02-PLAN.md` — Wave 2 cash workbench
- `08-03-PLAN.md` — Wave 3 payroll + invoices + expenses + P&L
- `08-04-PLAN.md` — Wave 4 rollback dispatcher + history UI

Research input:
- `08-RESEARCH.md` — 796 lines, dated 2026-05-13, HIGH confidence on Phase 2 primitives, MEDIUM on new tool bodies, LOW on accountant UX specifics
