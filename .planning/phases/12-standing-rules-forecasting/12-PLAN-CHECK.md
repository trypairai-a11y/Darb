# Phase 12 Plan Check — VERDICT: BLOCK

**Phase:** 12 — Owner-Authored Standing Rules + Forecasting
**Checked:** 2026-05-13
**Plans reviewed:** 4 (12-00 / 12-01 / 12-02 / 12-03)
**Total tasks:** 12 (3+3+3+3, last one a checkpoint:human-action)
**Status:** ISSUES FOUND — 6 BLOCKERS, 5 WARNINGS

---

## TL;DR

Phase 12's plans are internally well-structured (clean Wave 0→1→2→3 dependency chain, sound Holt-Winters math, idempotent migration patterns, correct chain-depth + throttle guards). **But they are built on a false premise:** the plans treat Phases 3–11 as shipped. `.planning/STATE.md` says `completed_phases: 3` and `Current Position: Phase 3 of 12 (Driver File)`. The current focus per STATE.md is "Ready to plan Phase 3."

Multiple foundational artifacts the plans import, extend, or coordinate with **do not exist on disk**:

| Artifact the plans depend on | Status | Plan that needs it |
|---|---|---|
| `backend/src/agent/prompts/briefing-owner.md` | MISSING (Phase 11 deliverable) | 12-02 Task 3 modifies it |
| `backend/src/services/briefings/narrator.ts` | MISSING (Phase 11 deliverable) | 12-02 Task 3 extends it |
| `frontend/src/app/(dashboard)/finance/expenses-pl/page.tsx` | MISSING (Phase 8 deliverable) | 12-02 Task 2 appends to it |
| Phase 11 trust-graduation hooks | MISSING | 12-01 Task 3 references them as "owned by Phase 11" |
| Action tools `suspendDriver`, `applyPenalty`, `escalateToHumanSupervisor`, `createTrainingTask` | MISSING (Phase 8 deliverables) | 12-01 catalog + 12-03 dp2-rule-templates name them as rule action targets |
| Existing 188+ tests baseline | Real (Phase 2 closed) | Plans claim 16 NEW tests on top — that part lines up |

Phase 12 cannot ship until at least Phase 8 + Phase 11 ship, OR the plans are restructured to (a) stub the missing surfaces explicitly, (b) drop the integrations into them, and (c) defer the Wave 3 milestone closeout that claims 12/12 phases complete.

The Phase 12 ROADMAP.md row says **Depends on: Phase 11** — that dependency is being honoured in the prose but violated in the file-modification lists.

---

## Dimension Results

| # | Dimension | Result |
|---|-----------|--------|
| 1 | Requirement Coverage | PASS (REQ-data-agent-rule + REQ-agent-read-tools forecast subset fully mapped) |
| 2 | Task Completeness | PASS (all tasks have files / action / verify / done; type fields valid; checkpoint task uses correct gate shape) |
| 3 | Dependency Correctness | PASS (linear 0→1→2→3 wave chain; depends_on values match wave numbers) |
| 4 | Key Links Planned | PASS (shared `<CashFlowProjection>`, footer link, briefing narrator extension all wired) |
| 5 | Scope Sanity | WARNING (12-01 Task 1 = 10 files, 12-01 Task 2 = 9 files, 12-02 Task 1 = 14 files; large but bounded) |
| 6 | Verification Derivation | PASS (truths are user-observable; min_lines reasonable; key_links concrete) |
| 7a | Context Compliance | N/A (no CONTEXT.md exists for Phase 12) |
| 7b | Scope Reduction Detection | WARNING (12-02 defers per-platform breakdown and AND-conditions to "Phase 12.1" — these match Research Open Q5 + the planner's stated D-04 decision so this is documented v1 scope, not silent reduction) |
| 7c | Architectural Tier Compliance | PASS (rule eval API-tier, frontend rules page in dashboard tier, forecast cache in AgentMemory matches Responsibility Map) |
| 8 | Nyquist Compliance | FAIL — 8e gate trips: VALIDATION.md does NOT exist for Phase 12 |
| 9 | Cross-Plan Data Contracts | PASS (single source of truth: `services/standingRules/types.ts` mirrored to `frontend/src/lib/types/rules.ts`; no conflicting transforms) |
| 10 | CLAUDE.md Compliance | PASS (Express+Prisma+Redis+BullMQ stack; routes use auth+tenantScope+RBAC; bilingual respected via `draftCourierMessage`; auto-deploy + Vercel alias explicit in Wave 3) |
| 11 | Research Resolution | FAIL — `## Open Questions` in 12-RESEARCH.md is NOT marked `(RESOLVED)`. Plans reference user "decisions" D-01..D-06 but those decisions are NOT in CONTEXT.md (which doesn't exist) and NOT in the research's open-questions section as resolved. |
| 12 | Pattern Compliance | N/A (no PATTERNS.md for Phase 12) |
| ★ | **Project-state coherence** (custom dimension) | **FAIL — see Blocker #1, the dominant issue** |

---

## Blockers (must fix before execution)

### BLOCKER #1 — Phase 12 is being planned before its prerequisites have shipped

**Severity:** BLOCKER. The phase goal cannot be achieved.

`.planning/STATE.md` (line 11): `completed_phases: 3`. Line 32: `Phase: 3 of 12 (Driver File)`. Line 105: `Next action: /gsd-plan-phase 3`.

Yet Phase 12 plans:
- 12-02 Task 2 modifies `frontend/src/app/(dashboard)/finance/expenses-pl/page.tsx` (Phase 8 deliverable per ROADMAP.md Q2).
- 12-02 Task 3 modifies `backend/src/agent/prompts/briefing-owner.md` and `backend/src/services/briefings/narrator.ts` (Phase 11 deliverables — see RESEARCH.md A1).
- 12-03 Task 1 closes the milestone with `completed_phases: 12, percent: 100` — this contradicts the actual STATE.md.
- 12-03 Task 1 marks ROADMAP.md Phase 12 row complete with `[x] **Phase 12 ... Completed 2026-05-13` while Phases 3-11 remain `[ ]`.

**Disk verification:** I ran existence checks on the artifacts the plans claim to modify:
- `frontend/src/app/(dashboard)/finance/expenses-pl/page.tsx` → MISSING
- `backend/src/services/briefings/narrator.ts` → MISSING
- `backend/src/agent/prompts/briefing-owner.md` → MISSING
- `frontend/src/hooks/useDecisions.ts` → MISSING (Phase 2 ships but uses a different pattern — Phase 2's chat hooks are `useChatThreads`, `usePinnedViews`, etc. — there is no `useDecisions.ts` to mirror; plan references it as the "Phase 2" reference)

**Action tools called by catalog.ts in 12-01 Task 1** (Wave 1 invoker.ts dispatches via toolRegistry.invoke):
- `suspendDriver` → MISSING (Phase 8 deliverable; current `backend/src/agent/tools/action/index.ts` ships only `draftCourierMessage`, `flagForReview`, `proposeCashReminder` as of Phase 2 close)
- `applyPenalty` → MISSING (Phase 8)
- `escalateToHumanSupervisor` → MISSING (Phase 8)
- `createTrainingTask` → MISSING (Phase 8)

If Wave 1 ships, the rule catalog references tools that aren't registered in `toolRegistry`. `toolRegistry.invoke("suspendDriver", ...)` will throw `tool_not_found`. The 5-default-templates seed in `services/standingRules/catalog.ts` becomes a runtime trap.

**Where the plan's own fallback notes this:**
- 12-RESEARCH.md "Environment Availability" Assumption A1 ("Phase 11 ships before Phase 12") + the dependency table at line 796-798 explicitly says: "If Phase 8 hasn't shipped, Phase 12's rule action target dropdown only shows `flagForReview` and `draftCourierMessage`." But neither the catalog (12-01) nor dp2-rule-templates.json (12-03) honour that fallback — they hard-code all 5 missing tools.

**Fix paths (one of):**
1. **PREFERRED:** Park Phase 12 until Phases 3-11 have closed. Re-run `/gsd-plan-phase 12` then.
2. **Restructure with fallback enforcement:** Rewrite 12-01 Task 1 catalog.ts + 12-03 dp2-rule-templates.json to use ONLY the Phase 2 always-available tools (`flagForReview`, `draftCourierMessage`, `proposeCashReminder`). Drop 12-02 Task 2's `finance/expenses-pl` mod (gate behind "if-page-exists" check or move to a deferred Phase 12.1 file). Drop 12-02 Task 3's briefing-narrator changes entirely (they require Phase 11). Drop 12-03 Task 1's PROJECT.md + STATE.md "12/12" milestone closeout — replace with "Phase 12 of v2-pivot complete; Phases 3-10 remain" language.
3. **Conditional execution:** Add explicit pre-flight gates to every Wave 1/2/3 task that checks file existence and gracefully skips. This is the messiest path.

---

### BLOCKER #2 — Wave 2 Task 3 modifies files that Phase 11 owns; no fallback if Phase 11 not yet shipped

**Severity:** BLOCKER.

12-02 Task 3 action step 3-4: extends `backend/src/agent/prompts/briefing-owner.md` and `backend/src/services/briefings/narrator.ts`. Both are Phase 11 artifacts (RESEARCH.md confirms: "Phase 11 narrator" line 124-125 of 12-02 plan; RESEARCH §"Architectural Responsibility Map" line 33 says "Extend `briefing-owner.md` system prompt (Phase 11)").

Existence check: BOTH FILES ARE MISSING.

The plan implicitly assumes the parent file exists and just needs the anomaly-threshold guard appended. If Phase 11 hasn't shipped, Wave 2 Task 3 either (a) creates the file from scratch — which is out of scope for Phase 12 and conflicts with Phase 11's later design — or (b) fails on first edit.

The verifier prompt explicitly asked: *"Coordinate with Phase 11: Phase 12 depends on Phase 11 trust-graduation hooks. Verify graceful degradation noted in plans if Phase 11 hooks not yet shipped."*

**Plan-level graceful degradation found:** Only one fragment — 12-01 Task 3 line 478: "Wave 1 ships **no auto-execute** — every rule firing routes through propose-and-confirm via PendingAgentAction. Trust graduation hooks (Phase 11) decide auto-execute eligibility independently; Phase 12 does not change that."

That's good for the auto-execute boundary. But it does NOT cover:
- The narrator extension (Wave 2 Task 3) — no fallback
- The briefing-owner.md prompt extension (Wave 2 Task 3) — no fallback
- The forecast cache `source='cached_forecast'` exemption from Phase 11 memory pruning (Pattern 4 + Research line 66) — no fallback

**Fix hint:** 12-02 Task 3 must either:
- Bail with "skip if Phase 11 not shipped" (and document the consequence: morning briefings won't mention forecasts until Phase 11 ships), OR
- Add a Wave 2 pre-flight that creates a minimal `briefing-owner.md` stub + `narrator.ts` stub that Phase 11 will later overwrite. This is risky — Phase 11's own plan will conflict.

---

### BLOCKER #3 — Wave 3 milestone closeout is unconditionally false

**Severity:** BLOCKER.

12-03 Task 1 writes to:
- `.planning/STATE.md` → `completed_phases: 12, percent: 100, status: complete`
- `.planning/ROADMAP.md` → `[x] **Phase 12** ... Completed 2026-05-13`
- `.planning/MILESTONE-SUMMARY.md` → "v2 Pivot Milestone Summary — 12/12 phases done"
- `.planning/phases/12-standing-rules-forecasting/12-VERIFICATION.md` → cross-references "Phase 3-11: TBD as each closes"

The last line is a self-acknowledged contradiction: the verification document admits Phases 3-11 are "TBD" while STATE.md is being set to `completed_phases: 12`. The plan is internally inconsistent.

The `automated` verify for Task 1:
```
grep -c 'LOCKED (conditional)' .planning/PROJECT.md && grep -c '## Test Counts' .planning/phases/12-standing-rules-forecasting/12-VERIFICATION.md && grep -c 'v2 Pivot Milestone' .planning/MILESTONE-SUMMARY.md
```
…validates that the false claims were written to disk — not that they're true. Test-counter integrity is missed.

**Fix hint:** Wave 3 closeout language must reflect actual state. Recommended phrasing if 12 is run before 3-11:
- STATE.md: `phase: 12` (the phase that just shipped), but `completed_phases` must reflect actual completion count, not 12.
- ROADMAP.md: Phase 12 row can be `[x]` but Phases 3-11 rows must remain `[ ]`.
- MILESTONE-SUMMARY.md: Reframe as "Phase 12 closeout" not "milestone closeout."

---

### BLOCKER #4 — Catalog rule templates and DP2 seed reference unimplemented action tools

**Severity:** BLOCKER (related to #1 but mechanically distinct).

12-01 Task 1 step 7 (catalog.ts): 5 default rule templates reference `suspendDriver`, `applyPenalty`, `flagForReview`, `draftCourierMessage`, `escalateToHumanSupervisor`. Only `flagForReview` + `draftCourierMessage` exist today.

12-03 Task 2 step 2 (dp2-rule-templates.json): 5 placeholder rules reference `suspendDriver`, `flagForReview`, `draftCourierMessage`, `flagForReview`, `escalateToHumanSupervisor`. Same problem.

When the catalog runs against a real tenant at server boot (Wave 1 Task 3: "POST /api/rules/templates/:templateId/instantiate" path), the planner intends users to one-click instantiate. The first time an aggregate rule for "Three-strike late absence" fires, the invoker calls `toolRegistry.invoke("suspendDriver", ...)` → throws → rule fails silently or surfaces a runtime error.

Equally, the Wave 0 test scaffolding (12-00 Task 2 ruleEvaluator.test.ts case 1 — "violation rule fires") implies a `violation` event will dispatch through a real path. If `applyPenalty` were the action, the test stub for invoker would need to mock or stub the tool. The plan never says what to do when the tool is missing.

**Fix hint:** Either
- ship catalog.ts with ONLY the two real tools (`flagForReview`, `draftCourierMessage`), accepting that the catalog is degraded, OR
- gate `defaultRuleTemplates` behind `toolRegistry.has(tool)` filtering at module load — only emit templates whose tool exists. The catalog becomes self-pruning. Tests must cover the empty-catalog case.

---

### BLOCKER #5 — VALIDATION.md does not exist for Phase 12 (Dimension 8e gate)

**Severity:** BLOCKER per the Dimension 8e check.

```bash
ls .planning/phases/12-standing-rules-forecasting/*-VALIDATION.md
# (no output)
```

Per the verification rules, Nyquist sampling checks 8a–8d are SKIPPED when 8e fails. The phase cannot proceed past plan-check until VALIDATION.md is regenerated.

**Fix hint:** Re-run `/gsd-plan-phase 12 --research` to regenerate the validation surface, or author VALIDATION.md manually covering: event-listener latency budget, cron-tick throughput, holt-winters error bounds, dry-run replay correctness.

---

### BLOCKER #6 — Research Open Questions are not resolved; D-01..D-06 user decisions are not anchored

**Severity:** BLOCKER per Dimension 11.

`12-RESEARCH.md` line 754 has `## Open Questions` (NOT `(RESOLVED)`). Six questions Q1-Q6 are listed with "Recommendation:" prose but no explicit `RESOLVED:` marker per question and no section-level resolution suffix.

Yet 12-02 plan objective bullets at lines 157-162 cite user decisions:
- D-01 (rule-fired proposals): show footer "via rule: X"
- D-02 (briefing forecasts): 15% anomaly threshold
- D-03 (cash flow surface): shared component on /forecast + /finance/expenses-pl
- D-04 (AND of conditions): deferred to Phase 12.1
- D-05 (rule export/import): Wave 2 includes JSON export/import
- D-06 (DP2 trust level): default 0

These read like decisions captured from a `/gsd-discuss-phase` step — but `CONTEXT.md` does not exist for Phase 12. The decisions are claimed but not anchored. There is no `CONTEXT.md` file, no resolution markers in RESEARCH.md, and no way for the executor to trace D-01..D-06 back to a user-confirmed source.

If a user actually made these decisions, they should appear in `CONTEXT.md`. If they didn't, the planner inferred them from the Research recommendations — which is fine as a "Claude's discretion" choice, but mislabelling them as user decisions confuses audit.

**Fix hint:** Either
- create `.planning/phases/12-standing-rules-forecasting/12-CONTEXT.md` documenting D-01..D-06 as the user actually decided them (with timestamps and rationale), OR
- relabel them in 12-02 plan objective as "planner inferred from RESEARCH §Open Questions recommendations" rather than user decisions, AND mark the Open Questions section `(RESOLVED)` with each Qn carrying an explicit RESOLVED marker.

---

## Warnings (should fix; execution can proceed if blockers cleared)

### WARNING #1 — Plan 12-02 Task 1 has 14 files modified
Plan 12-02 Task 1's `<files>` list contains 14 files. Threshold from verification dimensions: 10 = warning, 15 = blocker. Sits at warning. The work is genuinely cohesive (one feature surface = /rules) but quality may degrade.

**Fix hint:** Split into 12-02a (list page + hooks + lib + types + sidebar) and 12-02b (builder + dry-run + export-import + tests).

### WARNING #2 — Plan 12-01 Task 1 + Task 2 each touch 10 files of new code
Acceptable for a from-scratch directory but a single task is doing a lot. If a test fails partway, recovery is harder.

**Fix hint:** Optional — split Wave 1 Task 1 into "evaluator + throttle + invoker" (the core hot path) and "dryRun + catalog + eventListener + cron worker" (the harness). Same for Task 2: "math + types" + "demand/supply/cash services + agent tools."

### WARNING #3 — Wave 0 RED-test pattern claims "import error = RED signal"
12-00 Task 2 + Task 3 lean on `Cannot find module` as the failure signal. Per Nyquist 8a, the `<automated>` command for these tests must actually exit non-zero. A "Cannot find module" jest error returns the right exit code, but some test runners are configured to fail-fast on import — and the test cases themselves never run, so the assertions are unverified at Wave 0 close.

**Fix hint:** Acceptable as a Wave 0 scaffolding signal as long as Wave 1 verify step (which DOES run the tests) is the actual signal that flips them GREEN. Verification is correctly designed: Wave 1 Task 3's `<verify>` runs the full test suite. Keep but document.

### WARNING #4 — 12-02 frontend "no new dependencies" constraint may be violated by Monaco mention
12-02 Task 1 step 7 (RuleJsonEditor.tsx): "use textarea + JSON.parse validation if Monaco not installed; preserve no-new-deps constraint." Good guardrail. But step 1 imports `useRules`/`useToolSchema` patterns from React Query — if the project doesn't already have `@tanstack/react-query` set up at the level the plan implies, this becomes a new dep.

**Fix hint:** Confirm `@tanstack/react-query` is installed (Phase 2 used it — likely fine) and Vitest is at the version the plan assumes. Phase 2 SUMMARY shows 6 frontend tests passing under Vitest 3 — patterns should hold.

### WARNING #5 — Migration sequence numbering may collide
12-00 Task 1 step 6: `backend/prisma/migrations/20270201000000_phase12_standing_rules_forecast/migration.sql`. The timestamp `20270201` is in the future relative to current date (2026-05-13). Existing migrations follow `20260513120000_chat_pinned_views_scheduled_briefings` pattern (current-year-month-day). The future timestamp won't cause data corruption but breaks the timestamp ordering convention — and if Phase 11's migration lands later with a 2026 timestamp, Prisma's migration order will be wrong.

**Fix hint:** Use a current-date timestamp like `20260513140000_phase12_standing_rules_forecast` to match the existing convention.

---

## Strengths (worth preserving)

1. **Architecture grounded in existing primitives.** No new infrastructure — `toolRegistry.invoke`, `eventBus.subscribe`, `BullMQ JobScheduler`, `AgentMemory`, Redis sorted-set throttle. All reused. Good engineering discipline.
2. **Pitfalls→guards 1:1 mapping.** Every research pitfall has a corresponding plan task or test:
   - Pitfall 1 (oscillation) → chain-depth ≤ 3 in 12-01 Task 1 step 5 + 12-00 Task 2 ruleOscillationGuard.test.ts
   - Pitfall 2 (cold start) → 3-tier fallback in 12-01 Task 2 step 3 + 12-00 Task 3 coldStart.test.ts
   - Pitfall 5 (inactive drivers) → driver lifecycle predicate in 12-01 Task 1 step 3 + 12-00 Task 2 aggregateEvaluator.inactiveDrivers.test.ts
   - Pitfall 7 (cron race) → Redis SETNX EX 600 + concurrency=1 + staggered minute in 12-01 Task 1 step 9 + 12-00 Task 2 standingRulesCronWorker.idempotent.test.ts
3. **Wave 0 RED-first discipline.** 16 test files staged before any production code; Wave 1 is a pure GREEN drive. This is exemplary TDD scaffolding.
4. **Idempotent migration.** 12-00 Task 1 step 6 uses `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` + the DO-EXCEPTION wrapper for FK constraints. Safe to re-run on prod.
5. **Synthetic ctx for rule firings.** 12-01 Task 1 step 5: `userId: undefined` routes through the existing approval gate. No new approval path. Audit trail clean.
6. **Conditional-LOCKED pattern for Wave 3.** Rather than claiming unconditional ratification, the plan correctly notes "LOCKED (conditional)" with rollback triggers — matches RESEARCH Pitfall 8 escape hatch.
7. **PII redaction in dry-run.** 12-01 Task 1 step 6: first-initial+last-name + `+965 *** **NNN` phone masking. Threat T-12-W1-05 properly mitigated.

---

## Recommendation

**Do NOT execute Phase 12 plans as written.**

Two coherent paths:

**Path A (recommended):** Park Phase 12. Execute Phases 3 → 11 sequentially via the standard `/gsd-plan-phase N` flow. When Phase 11 closes, re-run `/gsd-plan-phase 12 --research` to regenerate plans against actual project state. The current Phase 12 plans should be archived (not deleted — there is genuinely good design work in them, particularly the Holt-Winters Pattern 3 and the chain-depth guard).

**Path B (if there's a hard need to ship 12 first):** Restructure the plans:
1. Strip 12-02 Task 2's `finance/expenses-pl` mod (gate behind file existence).
2. Strip 12-02 Task 3 entirely (it requires Phase 11 narrator + briefing prompt).
3. Strip 12-03 Task 1's "12/12 milestone close" language. Replace with "Phase 12 close; Phases 3-10 remain pending."
4. Restrict catalog.ts and dp2-rule-templates.json to action tools that actually exist (`flagForReview`, `draftCourierMessage`, `proposeCashReminder`).
5. Resolve research Open Questions by adding `(RESOLVED)` to the heading + each question.
6. Author `12-CONTEXT.md` documenting D-01..D-06 explicitly OR strip those references from 12-02.
7. Author `12-VALIDATION.md` (Dimension 8e gate).
8. Fix migration timestamp to 2026-style.

After either path's fixes are in, re-run `/gsd-plan-checker 12`.

---

## Final two-line summary
Phase 12 plans BLOCK on prerequisite-phase coupling: 6 blockers driven by Phases 3-11 not yet shipped (STATE.md says completed=3, plan claims 12/12), missing dependent files, and missing CONTEXT/VALIDATION sidecars.
Next: park Phase 12, execute Phases 3-11 first; OR restructure 12-01/02/03 to remove finance/briefing/milestone-close work and gate the catalog on tool availability.
