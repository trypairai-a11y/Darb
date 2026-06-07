---
phase: 06-ingest-adapter-layer
plan: 04
subsystem: ingestion
tags: [bullmq, prisma, ingest-adapter, backwash, audit]

# Dependency graph
requires:
  - phase: 02-decisions-surface-propose-and-confirm-design-partner-1
    provides: onboardingBackwashWorker scaffold + Phase 2 deferred deferral of real scraper invocation
  - phase: 06-ingest-adapter-layer (Wave 1)
    provides: IngestAdapter contract, CompositeAdapter, writeIngestRun audit helper, NotAvailable error
  - phase: 06-ingest-adapter-layer (Wave 2a)
    provides: Keeta + Americana adapter tiers + getAdapter registry switch arms
  - phase: 06-ingest-adapter-layer (Wave 2b)
    provides: Talabat + Deliveroo adapter tiers + getAdapter registry switch arms
provides:
  - pullChunkPhase6(args): real backwash chunk handler that calls getAdapter().fetch{Orders,Shifts,Attendance,Violations} and writes 1 IngestRun row per chunk (source: BACKWASH)
  - startOnboardingBackwashWorker rewired to use pullChunkPhase6 by default (defaultPullChunkPhase2 retained for backward-compatible test injection)
  - Pitfall 6 enforcement: per-chunk failures captured as FAILED IngestRun rows; never throw to abort the 30-day window
  - BLOCKER 2 enforcement: adapter.fetchCash never called from backwash worker (cashRows hardcoded to 0)
affects:
  - 07-live-floor (consumes ingest-driven IngestRun audit trail)
  - 09-mobile-inbox-bilingual (driver-side outbound channel reuses MOBILE_GPS-sourced rows)
  - 11-trust-v2-briefings (per-tenant precedence overrides + Talabat/Deliveroo real-scraper expansion deferred here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker → adapter → audit pipeline: pullChunkPhase6 → getAdapter → CompositeAdapter.dispatchFetch → writeIngestRun (source: BACKWASH)"
    - "Per-capability safeFetch wrapper: NotAvailable is silenced, other errors accumulate into a single FAILED IngestRun row with errorLog"
    - "Re-export-from-sibling-module idiom: pullChunkPhase6.ts owns the implementation; onboardingBackwashWorker.ts re-exports for backward-compatible import paths"

key-files:
  created:
    - backend/src/queues/pullChunkPhase6.ts
    - .planning/phases/06-ingest-adapter-layer/06-04-SUMMARY.md
  modified:
    - backend/src/queues/onboardingBackwashWorker.ts
    - backend/src/__tests__/services/ingest/compositeFetchCash.test.ts
    - backend/package.json

key-decisions:
  - "Implementation lives in a NEW file (backend/src/queues/pullChunkPhase6.ts), not as an additional export inside onboardingBackwashWorker.ts as the plan originally proposed. The two Wave 0 RED tests (queues/pullChunkPhase6.test.ts + services/ingest/compositeFetchCash.test.ts) both import from '.../queues/pullChunkPhase6' — that import path is the test contract. onboardingBackwashWorker.ts re-exports pullChunkPhase6 so any future caller that imports from the worker barrel keeps working."
  - "v1 rowsOk = sum(orderRows + shiftRows + attendanceRows + violationRows) — counts rows the adapter produced, NOT rows persisted. Phase 11 wires per-capability upserts once mobile + scraper produce the full normalized shapes. cashRows is hardcoded to 0 (BLOCKER 2 — XLSX-import-only)."
  - "fetchCash is deliberately NOT called from pullChunkPhase6 even though CompositeAdapter has the method. The policy 'cash is XLSX-import-only' is enforced at the worker layer (Pattern 4 from RESEARCH §Backwash Wiring), not by removing the method from the adapter interface."
  - "compositeFetchCash.test.ts mock factory replaced with `() => require(\"../../mocks/config\")` — same Wave 1/Wave 3 idiom. The previous inline-factory pattern only mocked the 3-level path; audit.ts and the adapters all use 2-level paths that resolved to a different mocks/config instance with no mockResolvedValue applied."

patterns-established:
  - "Backwash chunk handler shape: (BackwashChunkArgs) → Promise<{rowsOk: number}>, never throws, always writes 1 IngestRun row regardless of outcome."
  - "Per-capability error scoping: safeFetch isolates failures so a broken scraper tier doesn't cascade into the XLSX/mobile fetches for the same chunk."

requirements-completed:
  - REQ-ingest-adapter-layer

# Metrics
duration: 25min
completed: 2026-05-13
---

# Phase 6 Plan 04: Wire pullChunkPhase6 into onboardingBackwashWorker Summary

**Phase 2's deferred 'real scraper invocation in onboardingBackwashWorker' closed: each 5-day backwash chunk now calls `getAdapter(platform, {tenantId}).fetch{Orders,Shifts,Attendance,Violations}`, captures per-capability failures into `IngestRun.errorLog`, and writes exactly one `IngestRun` row (source: BACKWASH) per chunk — without ever aborting the 30-day window (Pitfall 6).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-13T07:12:00Z
- **Completed:** 2026-05-13T07:37:00Z
- **Tasks:** 3 (Task 1 implemented + committed; Tasks 2 & 3 verification-only)
- **Files created:** 1 (pullChunkPhase6.ts)
- **Files modified:** 3 (onboardingBackwashWorker.ts, compositeFetchCash.test.ts, package.json)

## Accomplishments

- `pullChunkPhase6` shipped as a standalone module that satisfies both Wave 0 RED tests (`queues/pullChunkPhase6.test.ts` 6/6 GREEN, `services/ingest/compositeFetchCash.test.ts` 6/6 GREEN).
- `startOnboardingBackwashWorker` wired to use `pullChunkPhase6` by default — Phase 2's deferred truth ('Real scraper invocation in onboardingBackwashWorker') closed end-to-end.
- `defaultPullChunkPhase2` retained as an exported function so Phase 2's `__tests__/queues/onboardingBackwashWorker.test.ts` (chunk count / concurrency cap / progress events — 3/3 GREEN) continues to pass via its existing inject-your-own-pullChunk pattern.
- BLOCKER 2 (cash is XLSX-import-only) enforced at the worker layer: `adapter.fetchCash` is never called from `pullChunkPhase6`; `cashRows` hardcoded to 0.
- Pitfall 6 (per-chunk failure must not abort the 30-day window): outer try/catch around `getAdapter` writes a FAILED IngestRun row and returns `{rowsOk: 0}` instead of throwing; per-capability `safeFetch` wrapper isolates individual adapter failures into `errors[]`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement pullChunkPhase6 + wire into startOnboardingBackwashWorker** — `6551ffe` (feat)
2. **Task 2: Verify MOBILE_GPS migration in place** — no commit (verification only; migration shipped in Wave 1 commit `5d5a947`)
3. **Task 3: Final close-out (full test suite + lint + integration smoke)** — no commit (verification only; documented in this SUMMARY)

**Plan metadata commit:** (this commit — includes SUMMARY.md)

## Files Created/Modified

- `backend/src/queues/pullChunkPhase6.ts` (CREATED) — Real backwash chunk handler. Exports `pullChunkPhase6(args): Promise<{rowsOk: number}>`. Calls `getAdapter(platform, {tenantId}).fetch{Orders,Shifts,Attendance,Violations}` per chunk, writes one `IngestRun` row (source: BACKWASH), never throws.
- `backend/src/queues/onboardingBackwashWorker.ts` (MODIFIED) — Added `import { pullChunkPhase6 } from "./pullChunkPhase6"` + `export { pullChunkPhase6 } from "./pullChunkPhase6"`. Swapped `pullChunk: defaultPullChunkPhase2` → `pullChunk: pullChunkPhase6` inside `startOnboardingBackwashWorker`. Updated docstring to reflect Phase 6 wiring.
- `backend/src/__tests__/services/ingest/compositeFetchCash.test.ts` (MODIFIED) — Replaced the inline `jest.mock("../../../config", factory)` with `jest.mock("../../../config", () => require("../../mocks/config"))` so the test's `prisma` instance and the audit/adapter's `prisma` instance converge on the shared `mocks/config.ts` stub. Same idiom Wave 1 used for `audit.test.ts` and Wave 3 used for `talabatImport.test.ts`.
- `backend/package.json` (MODIFIED) — Added `src/queues/pullChunkPhase6.ts` to the `lint:tenant` script's file glob so the no-prisma-without-tenant rule continues to cover the production code surface even though pullChunkPhase6.ts has no direct prisma calls. (Later in the session, additional finance scopes were appended by a different change — unrelated to Wave 4.)

## Phase 6 Must-Have Satisfaction

| must_have | satisfied by | evidence |
|---|---|---|
| `pullChunkPhase6` exported from `onboardingBackwashWorker.ts`, calls `getAdapter().fetch...` per chunk, writes BACKWASH IngestRun, never throws | Task 1 | `backend/src/queues/pullChunkPhase6.ts:32-145` + `onboardingBackwashWorker.ts:48-49` re-export |
| `startOnboardingBackwashWorker` swaps `defaultPullChunkPhase2 → pullChunkPhase6` | Task 1 | `onboardingBackwashWorker.ts:285-293` |
| Phase 2 `onboardingBackwashWorker.test.ts` continues to pass (chunk count, concurrency, progress) | Task 1 (regression validation) | `__tests__/queues/onboardingBackwashWorker.test.ts` — 3/3 GREEN |
| Wave 0 `orderSourceMobileGps.test.ts` GREEN | Wave 1 already turned GREEN — Wave 4 re-verified | `__tests__/services/ingest/orderSourceMobileGps.test.ts` — 1/1 GREEN |
| Migration purely additive (zero DROP/DELETE/RENAME) | Wave 1 ship; Wave 4 verify | `prisma/migrations/20260513130000_add_mobile_gps_order_source/migration.sql` — single `ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'MOBILE_GPS'`; `grep -cE "(DROP|DELETE|TRUNCATE|RENAME)" → 0` |
| Prisma client regenerated; `OrderSource.MOBILE_GPS` available | Wave 1 ship; Wave 4 verify | `grep -c MOBILE_GPS backend/src/generated/prisma/index.d.ts → 1` |
| Phase 6 ships `fetchCash` via XLSX import only; backwash `cashRows` always 0 | Task 1 | `pullChunkPhase6.ts:96-100` — `const cashRows = 0; void cashRows;`; `adapter.fetchCash` never invoked |
| Phase 2 + Phase 6 in-scope tests GREEN | Task 3 | 15 suites / 64 tests / 0 failed across `services/decisions|services/billing|services/onboarding|onboarding/backwashProgress|queues/onboardingBackwashWorker|queues/pullChunkPhase6|services/ingest` |
| `lint:tenant` exits 0 across new `services/ingest/**` + `queues/pullChunkPhase6.ts` scope | Task 1 / Task 3 | `npm run lint:tenant; echo $? → 0`. (11 pre-existing errors surfaced in `src/routes/cash.ts` because a different concurrent change extended lint:tenant scope to finance — out of Wave 4 scope.) |

## RESEARCH.md Critical Refactor Verification Steps

| step | check | result |
|---|---|---|
| 1 | Keeta `POST /import` route preserved | `grep -c "router.post.*\"/import\"" backend/src/routes/keeta.ts → 1` ✓ |
| 2 | Americana `/manual-upload` route preserved | `grep -c "router.post.*\"/manual-upload\"" backend/src/routes/americanaIngest.ts → 1` ✓ |
| 3 | `keetaPortalScraperWorker.ts` IngestRun audit pattern preserved | Wave 4 did NOT modify the file; the existing uncommitted modifications in the working tree were not introduced by this plan. ✓ |
| 4 | Phase 2 `onboardingBackwashWorker` RED tests still pass | 3/3 GREEN (chunk count, concurrency cap, progress events) ✓ |

## Decisions Made

- Wave 4 ships `pullChunkPhase6` as its own file `backend/src/queues/pullChunkPhase6.ts` (not inline inside `onboardingBackwashWorker.ts`). The Wave 0 RED tests both import the function from that exact path; relocating the implementation would have broken the test contract.
- `onboardingBackwashWorker.ts` re-exports `pullChunkPhase6` so the must_have "exported from onboardingBackwashWorker.ts" is technically satisfied at the barrel level even though the source of truth lives in the sibling file.
- `safeFetch` wrapper isolates per-capability failures so a broken Keeta scraper does not cascade into Americana XLSX fetches for the same chunk. NotAvailable is silenced because the CompositeAdapter has already exhausted all its tiers when it throws that — recording it as an error would falsely flag the chunk PARTIAL/FAILED.
- `rowsOk` v1 = count of rows the adapter PRODUCED (not rows persisted). Wave 11 will swap the count to count rows actually upserted into OrderLog / Shift / AttendanceRecord / Violation once mobile + scraper produce the full normalized data shapes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created `pullChunkPhase6.ts` as a standalone file instead of inlining into `onboardingBackwashWorker.ts`**
- **Found during:** Task 1 (Implement pullChunkPhase6)
- **Issue:** The plan instructed adding `pullChunkPhase6` as a new top-level export inside `onboardingBackwashWorker.ts`. However, the two Wave 0 RED tests that this plan must turn GREEN both import the function from `backend/src/queues/pullChunkPhase6.ts` (a separate file): `__tests__/queues/pullChunkPhase6.test.ts:37` and `__tests__/services/ingest/compositeFetchCash.test.ts:17`. Following the plan literally would have left those RED.
- **Fix:** Created the new file `backend/src/queues/pullChunkPhase6.ts` with the implementation, then added `import + export { pullChunkPhase6 } from "./pullChunkPhase6"` to `onboardingBackwashWorker.ts` so both import paths resolve to the same function (must_have "pullChunkPhase6 exported from onboardingBackwashWorker.ts" satisfied at the barrel level).
- **Files modified:** Created `backend/src/queues/pullChunkPhase6.ts` (145 lines); appended 2 lines to `backend/src/queues/onboardingBackwashWorker.ts`.
- **Verification:** `__tests__/queues/pullChunkPhase6.test.ts` — 6/6 GREEN.
- **Committed in:** `6551ffe` (Task 1 commit).

**2. [Rule 3 - Blocking] Fixed `compositeFetchCash.test.ts` mock factory to converge prisma instances**
- **Found during:** Task 1 (running Wave 0 RED tests after writing `pullChunkPhase6.ts`)
- **Issue:** The Wave 0 RED test `__tests__/services/ingest/compositeFetchCash.test.ts` used `jest.mock("../../../config", () => ({ prisma: { ingestRun: { create: jest.fn() } } }))`. This inline factory only mocked the 3-level path; `audit.ts` and the adapters import `prisma` via 2-level / 3-level paths, all of which the `jest.config.js::moduleNameMapper` (extended in Wave 3) routes to the shared `mocks/config.ts`. Net result: the test's `prisma.ingestRun.create` was a *different jest.fn instance* than the one `writeIngestRun` actually called — `mockResolvedValue({ id: "run-1" })` applied to one instance, the other returned `undefined`, `writeIngestRun` crashed on `row.id` of undefined.
- **Fix:** Replaced the inline factory with `jest.mock("../../../config", () => require("../../mocks/config"))` — same idiom Wave 1 used for `audit.test.ts` (commit 2a9034a) and Wave 3 used for `talabatImport.test.ts` (commit ea42233).
- **Files modified:** `backend/src/__tests__/services/ingest/compositeFetchCash.test.ts`.
- **Verification:** `__tests__/services/ingest/compositeFetchCash.test.ts` — 6/6 GREEN.
- **Committed in:** `6551ffe` (Task 1 commit).

**3. [Rule 2 - Missing Critical] Added `src/queues/pullChunkPhase6.ts` to `lint:tenant` scope**
- **Found during:** Task 1 (lint hygiene)
- **Issue:** `onboardingBackwashWorker.ts` is in `lint:tenant` scope; `pullChunkPhase6.ts` is its sibling and now owns the actual chunk-handler logic. Without explicit inclusion, future edits to `pullChunkPhase6.ts` that introduce un-scoped prisma calls would bypass the rule.
- **Fix:** Appended `src/queues/pullChunkPhase6.ts` to the `lint:tenant` script in `backend/package.json`. (Even though the file currently has no direct prisma calls — it routes through `writeIngestRun` — the inclusion documents intent and catches future regressions.)
- **Files modified:** `backend/package.json`.
- **Verification:** `npm run lint:tenant; echo $? → 0` on Wave 4 files.
- **Committed in:** `6551ffe` (Task 1 commit) — note a subsequent concurrent change extended the same scope to finance routes.

---

**Total deviations:** 3 auto-fixed (2 Rule 3 - blocking jest infra / test contract; 1 Rule 2 - lint hygiene)
**Impact on plan:** All three deviations were essential to keep Wave 0 RED tests GREEN and lint:tenant coverage honest. No scope creep — implementation lives in a single new file; all other Phase 6 must-haves satisfied as plan-stated.

## Issues Encountered

- `__tests__/routes/deliverooImport.test.ts` is currently RED (4/5 tests failing). This is a pre-existing Wave 3 gap: Wave 3 shipped `POST /api/talabat/import` (commit `ea42233`) but did NOT ship the parallel `POST /api/deliveroo/import` route. `backend/src/routes/deliveroo.ts` contains 0 `/import` POST routes (`grep -c "router.post.*\"/import\"" → 0`). Wave 4 did not introduce this regression and the deliveroo /import route is outside Wave 4's scope per the plan's `files_modified`. Deferred to Wave 3 follow-up.
- The full-suite run surfaces ~30 RED tests from Phase 7 / 8 / 9 / 11 untracked Wave 0 RED scaffolding files (e.g., `floor.snapshot.test.ts`, `pnlAggregator.test.ts`, `dualApproval.phase8.test.ts`, `eventBus.darbEventType.test.ts`, `orderRejectionToday.test.ts`, `liveFleetStatus.rejectionCount.test.ts`, etc.). These are forward-phase RED tests that will turn GREEN as their owning phases ship. None of them were caused by Wave 4 changes and all of them are in files added before this plan started.

## User Setup Required

None — Wave 4 is purely an internal wiring change. The migration was applied in Wave 1; no new env vars, no new dashboards, no external service configuration.

## Items Deferred to Phase 11

- Talabat / Deliveroo real-scraper adapters (currently `NotAvailable` placeholders) — requires `REQ-ingest-partner-api-conversations` and founder-supplied API credentials.
- Per-tenant adapter precedence overrides via `getAdapter` extension hook.
- Americana inbox watcher relocation into the IngestAdapter contract (currently lives outside the adapter layer).
- Talabat / Deliveroo XLSX schema refinement once founder supplies live samples.
- Per-capability upserts to OrderLog / Shift / AttendanceRecord / Violation tables — pullChunkPhase6's `rowsOk` currently counts adapter-produced rows, not persisted rows.

## Items Deferred to Phase 6 Wave 3 follow-up

- `POST /api/deliveroo/import` route + the `__tests__/routes/deliverooImport.test.ts` RED → GREEN transition. Wave 3 only landed the Talabat half of the dual-platform XLSX-fallback work.

## Next Phase Readiness

- Phase 6 close-out complete. The IngestAdapter contract, CompositeAdapter precedence chain, four-platform tier registry, and BACKWASH worker wiring are all in place.
- Phase 7 (Live Floor) can consume the IngestRun audit trail directly — `pullChunkPhase6` emits one row per (tenant, platform, chunk) with `source: BACKWASH` and machine-readable `status` (SUCCESS|PARTIAL|FAILED) + `rowsIn`/`rowsOk`/`errorLog` fields.
- Phase 9 (Mobile Inbox Bilingual) can rely on `OrderSource.MOBILE_GPS` being available at the Prisma client layer.

## Self-Check: PASSED

**File existence checks:**
- `backend/src/queues/pullChunkPhase6.ts` — FOUND
- `.planning/phases/06-ingest-adapter-layer/06-04-SUMMARY.md` — FOUND (this file)

**Commit existence checks:**
- `6551ffe` (Task 1) — FOUND in `git log --oneline --all`

**Wiring checks:**
- `grep -c "pullChunkPhase6" backend/src/queues/onboardingBackwashWorker.ts → 4` (≥ 3 required)
- `grep -c "defaultPullChunkPhase2" backend/src/queues/onboardingBackwashWorker.ts → 4` (≥ 1 required)
- `grep -c "MOBILE_GPS" backend/src/generated/prisma/index.d.ts → 1`
- `find backend/prisma/migrations -name "*_add_mobile_gps_order_source" -type d | wc -l → 1`
- `grep -cE "(DROP|DELETE|TRUNCATE|RENAME)" backend/prisma/migrations/*_add_mobile_gps_order_source/migration.sql → 0`

**Test checks:**
- `__tests__/queues/pullChunkPhase6.test.ts` — 6/6 GREEN
- `__tests__/services/ingest/compositeFetchCash.test.ts` — 6/6 GREEN
- `__tests__/queues/onboardingBackwashWorker.test.ts` — 3/3 GREEN (Phase 2 regression)
- `__tests__/services/ingest/orderSourceMobileGps.test.ts` — 1/1 GREEN
- Full Phase 2 + Phase 6 in-scope suite — 15 suites / 64 tests / 0 failed

---

*Phase: 06-ingest-adapter-layer*
*Wave: 4 (close-out)*
*Completed: 2026-05-13*
