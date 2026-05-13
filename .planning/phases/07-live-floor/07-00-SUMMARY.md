---
phase: 07-live-floor
plan: 00
subsystem: testing
tags: [jest, vitest, sse, leaflet, prisma, agent-tools, propose-and-confirm, tenant-isolation]

# Dependency graph
requires:
  - phase: 01-agent-runtime
    provides: "DarbEventType union (eventBus.ts), toolRegistry + read-tool registration pattern, liveFleetStatus tool"
  - phase: 02-decisions
    provides: "draftCourierMessage propose-and-confirm tool, /api/decisions/:id/approve, PendingAgentAction model"
  - phase: 03-driver-file
    provides: "DriverLink, AskDarbWhyDrawer + DriverFileScoreExplanation, ScoreTrendChart primitive"
  - phase: 04-chat
    provides: "ChatActionCard component, useSSE hook, SlidePanel"
  - phase: 05-mobile-beacon
    provides: "POST /api/agent/location handler, CourierOnlineSession model, LocationLog batched writes"
provides:
  - "9 backend RED tests asserting every Wave 1-3 backend contract"
  - "8 frontend RED tests asserting every Wave 2-3 frontend contract"
  - "Two shared 10-courier fixtures (backend + frontend) for deterministic seeding"
  - "Cross-tenant SSE isolation guard (Pitfall 6) baked into the safety net"
  - "Compile-time pin (TS2322) forcing Wave 1 to widen DarbEventType union"
affects:
  - "07-01: Wave 1 turns the 9 backend RED tests GREEN by widening DarbEventType, wiring publishEvent into POST /api/agent/location, building floor.ts routes, and adding the orderRejectionToday tool"
  - "07-02: Wave 2 turns LiveFloorMap, CourierMarker, useFloorRealtime GREEN"
  - "07-03: Wave 3 turns LiveFloorPage, FloorPillCounters, FloorFilters, CourierDetailPanel, PingButton GREEN"
  - "07-04: Wave 4 hardens edge cases discovered while turning Wave 1-3 tests GREEN"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RED-discipline: bare `require()` / `import` of not-yet-shipped modules drives RED state via 'Cannot find module' / 'Failed to resolve import'"
    - "Compile-time RED for type-system contracts: TS2322 on literal-type assignment forces Wave 1 to extend a union BEFORE the test file can compile"
    - "Shared fixture mirror: backend (Date objects, Prisma shape) + frontend (ISO strings, snapshot API shape) — same 10 couriers, parallel state across wire boundary"
    - "Tenant-isolation RED test runs the event bus in-process (subscribe + publishEvent) without HTTP, decoupling channel-keying guarantee from the SSE handler"
    - "supertest + req.user injection middleware for route tests — preserves the existing /api/drivers test pattern with explicit role overrides for RBAC assertions"

key-files:
  created:
    - "backend/src/__tests__/fixtures/floorCouriers.ts (10-courier seeding fixture + buildOnlineSessionRows projection)"
    - "backend/src/__tests__/agent/locationEventPublish.test.ts (gps_point + online_session_update publish contract)"
    - "backend/src/__tests__/routes/events.tenantIsolation.test.ts (Pitfall 6 cross-tenant channel guard)"
    - "backend/src/__tests__/agent/tools/read/liveFleetStatus.rejectionCount.test.ts (new orderRejectionCount aggregate)"
    - "backend/src/__tests__/agent/tools/read/orderRejectionToday.test.ts (new list tool)"
    - "backend/src/__tests__/routes/floor.snapshot.test.ts (GET /api/floor/snapshot)"
    - "backend/src/__tests__/routes/floor.counters.test.ts (GET /api/floor/counters)"
    - "backend/src/__tests__/routes/floor.ping.test.ts (POST /api/floor/ping/:driverId)"
    - "backend/src/__tests__/routes/floor.walkingSkeleton.test.ts (end-to-end integration)"
    - "backend/src/__tests__/services/eventBus.darbEventType.test.ts (compile-time TS2322 pin)"
    - "frontend/src/__tests__/fixtures/floorCouriers.ts (9-courier CourierSnapshot[] + scheduled-not-online + counter constants)"
    - "frontend/src/__tests__/components/floor/LiveFloorPage.test.tsx (orchestrator + W5 XOR)"
    - "frontend/src/__tests__/components/floor/LiveFloorMap.test.tsx (Leaflet SSR-safe + cluster config)"
    - "frontend/src/__tests__/components/floor/FloorPillCounters.test.tsx (NIT1 data-driven 3-pill array)"
    - "frontend/src/__tests__/components/floor/FloorFilters.test.tsx (B3 static-class safelist + URLSearchParams sync)"
    - "frontend/src/__tests__/components/floor/CourierDetailPanel.test.tsx (B4 satisfies-shape + 5-piece composition)"
    - "frontend/src/__tests__/components/floor/CourierMarker.stale.test.tsx (dot-color + ring-platform logic)"
    - "frontend/src/__tests__/components/floor/PingButton.test.tsx (POST -> ChatActionCard, Phase 9 deferral)"
    - "frontend/src/__tests__/components/floor/useFloorRealtime.test.tsx (W4 stable URL + Pitfall 10 visibilitychange)"
  modified: []

key-decisions:
  - "Used @ts-expect-error-free TS2322 compile errors to RED both eventBus.darbEventType and events.tenantIsolation tests — ts-jest surfaces TS2322 even with strict:false, so the whole suite fails to compile until Wave 1 widens DarbEventType. Avoids the @ts-expect-error trap where suppressions can pass tests today but become unused-suppression errors later."
  - "Two-file fixture (backend Date objects + frontend ISO strings) instead of one shared module — Prisma needs real Date instances for findMany/upsert; the wire format is ISO. Mirror keeps the 10 couriers and stale/scheduled distribution byte-identical across both."
  - "Inline mocks for prisma.keetaDailyMetrics + prisma.notification in the test files (not in mocks/config.ts) — the shared mock surface stayed untouched in Wave 0; Wave 1 will decide whether to promote these into the shared mock based on how many tests adopt them."
  - "Tenant-isolation test uses the event bus directly (publishEvent/subscribe) instead of the SSE HTTP handler — the handler's tenant scoping is already locked in Phase 4 via subscribe(req.user.tenantId). Wave 0's job is to assert the channel construction works; the handler's binding is asserted elsewhere."
  - "FloorPillCounters NIT1 (data-driven 3-pill array) and FloorFilters B3 (static Tailwind classes) baked into the canonical test files rather than separate `.NIT1` / `.staticClasses` suffix files — keeps the test file count at the 8 canonical names the plan's frontmatter declares."

patterns-established:
  - "RED test that imports the not-yet-existing module: bare `require('../../routes/floor').default` -> 'Cannot find module' is the RED signal. Wave N's first action is creating the module; the import resolves; the test runs; remaining assertions are the real contract."
  - "Type-only RED via TS2322: pin a literal to a not-yet-widened union; ts-jest fails to transpile; the suite is reported FAIL. Wave N widens the union, the cast disappears, the test runs."
  - "Behavior-rules RED via mocked dependencies: mock publishEvent/useSSE/api at the top of the test file; assert call signatures + side effects. Wave N wires the production code; assertions turn GREEN without touching the test."
  - "End-to-end walking skeleton: the thinnest test exercises every layer (route -> service -> tool -> bus -> approve). Wave 1's job is to make ONE test pass, which proves the whole stack is wired."

requirements-completed:
  - REQ-floor-live-map

# Metrics
duration: 23min
completed: 2026-05-13
---

# Phase 7 Plan 00: Wave 0 RED Scaffolding Summary

**17 failing tests + 2 shared fixtures lock the Live Floor contract before Wave 1 ships a single line of production code — every Wave 1-3 deliverable now has a Jest or Vitest test waiting for it.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-05-13T07:11:29Z
- **Completed:** 2026-05-13T07:34:47Z
- **Tasks:** 2 / 2
- **Files created:** 19 (10 backend, 9 frontend)
- **Files modified:** 0 (Wave 0 is purely additive)

## Accomplishments

- **9 backend RED tests** covering every Wave 1-3 backend deliverable: `publishEvent` wire-in inside `POST /api/agent/location` (with tenantId derived from `prisma.device.driver.tenantId` — Pitfall 6 defense), tenant-isolation guarantees on the SSE bus, the `liveFleetStatus.orderRejectionCount` extension, the new `orderRejectionToday` agent read tool, the four new routes under `/api/floor/*` (snapshot / counters / ping / walking-skeleton), and a TS2322 compile-time pin forcing the `DarbEventType` union to extend with `gps_point` + `online_session_update`.
- **8 frontend RED tests** covering every Wave 2-3 frontend deliverable: `<LiveFloorPage/>` orchestrator (with W5 XOR mutual-exclusion guard), `<LiveFloorMap/>` (Leaflet SSR-safe + MarkerClusterGroup configured per RESEARCH §Pattern 6), `<FloorPillCounters/>` (NIT1 data-driven 3-pill array, resolution #2 both-behaviors-on-click), `<FloorFilters/>` (URLSearchParams sync + B3 static-class safelist), `<CourierDetailPanel/>` (resolution #5 5-piece composition + B4 satisfies-shape), `<CourierMarker/>` (stale-classification dot-color + ring-platform logic), `<PingButton/>` (POST → ChatActionCard reuse, Phase 9 deferral), and `useFloorRealtime` (composes useSSE + react-query, W4 stable URL, Pitfall 10 visibilitychange).
- **Two shared 10-courier fixtures** (backend with Date objects + Prisma shape; frontend with ISO strings + snapshot API shape) — same distribution across both: 4 fresh working (1 per platform), 2 stale (lastGpsAt 15 min ago), 1 scheduled-not-online (Shift but no CourierOnlineSession row), 1 high-rejection Keeta driver (rejectedAuto = 5 today), 2 idle online.
- **Cross-tenant SSE isolation locked in**: `events.tenantIsolation.test.ts` runs `publishEvent` on tenA's channel + `subscribe` on tenA AND tenB; tenB's listener MUST NOT see the event. The test fails at compile time today (TS2322 on `"gps_point"` literal), turns GREEN once Wave 1 widens the union; the channel-keying scheme that enforces isolation is already in place in `services/eventBus.ts:69` (`events:{tenantId}`).
- **Walking-skeleton integration test** (`floor.walkingSkeleton.test.ts`) ties every layer end-to-end: snapshot fetch → counter fetch → publishEvent on the bus → ping stages PendingAgentAction → /approve creates Notification via `draftCourierMessage.execute()`. Wave 1's job is to make this single test pass — that proves the whole Phase 7 spine is wired.

## Task Commits

1. **Task 1: 9 backend RED tests + shared backend fixture** — `cb6091d` (`test(07-00): add 9 backend RED tests + fixture for Live Floor Wave 0`)
2. **Task 2: 8 frontend RED tests + shared frontend fixture** — included in `ea42233` (see Issues Encountered)

## Files Created

**Backend (10 files):**
- `backend/src/__tests__/fixtures/floorCouriers.ts` — 10-courier `CourierFixture[]` + `buildOnlineSessionRows` projection helper
- `backend/src/__tests__/agent/locationEventPublish.test.ts` — 5 tests asserting publishEvent contract on POST /api/agent/location
- `backend/src/__tests__/routes/events.tenantIsolation.test.ts` — 3 tests asserting cross-tenant SSE channel isolation
- `backend/src/__tests__/agent/tools/read/liveFleetStatus.rejectionCount.test.ts` — 4 tests for new orderRejectionCount aggregate
- `backend/src/__tests__/agent/tools/read/orderRejectionToday.test.ts` — 4 tests for new orderRejectionToday list tool
- `backend/src/__tests__/routes/floor.snapshot.test.ts` — 7 tests for GET /api/floor/snapshot (shape, tenant scope, RBAC, todayStats)
- `backend/src/__tests__/routes/floor.counters.test.ts` — 5 tests for GET /api/floor/counters (shape, aggregate, RBAC, tenant scope)
- `backend/src/__tests__/routes/floor.ping.test.ts` — 6 tests for POST /api/floor/ping (PendingAgentAction staging, RBAC, 404 cross-tenant)
- `backend/src/__tests__/routes/floor.walkingSkeleton.test.ts` — 1 integration test threading every layer
- `backend/src/__tests__/services/eventBus.darbEventType.test.ts` — 2 tests pinning DarbEventType union (TS2322 RED)

**Frontend (9 files):**
- `frontend/src/__tests__/fixtures/floorCouriers.ts` — 9 `CourierSnapshot[]` + `FLOOR_SCHEDULED_NOT_ONLINE` + `FLOOR_COUNTERS` + Kuwait City constants
- `frontend/src/__tests__/components/floor/LiveFloorPage.test.tsx` — 8 tests (orchestrator + W5 XOR + Pitfall 10)
- `frontend/src/__tests__/components/floor/LiveFloorMap.test.tsx` — 6 tests (SSR-safe + center + zoom + cluster + marker click)
- `frontend/src/__tests__/components/floor/FloorPillCounters.test.tsx` — 6 tests (NIT1 array + resolution #2 dual-callback + active/disabled states)
- `frontend/src/__tests__/components/floor/FloorFilters.test.tsx` — 6 tests (URLSearchParams + debounce + B3 static classes)
- `frontend/src/__tests__/components/floor/CourierDetailPanel.test.tsx` — 8 tests (5-piece composition + B4 satisfies-shape)
- `frontend/src/__tests__/components/floor/CourierMarker.stale.test.tsx` — 8 tests (4 status colors + 4 platform rings)
- `frontend/src/__tests__/components/floor/PingButton.test.tsx` — 5 tests (POST + ChatActionCard + Phase 9 deferral)
- `frontend/src/__tests__/components/floor/useFloorRealtime.test.tsx` — 7 tests (composition + gps_point dict + counter invalidation + W4 stable URL + Pitfall 10)

## Decisions Made

1. **TS2322 compile-time RED for type-system contracts** — instead of `@ts-expect-error` suppressions (which create the wrong polarity: passing today, failing later). Bare literal assignment forces the whole test file to fail to transpile until Wave 1 widens the union. Cleaner RED signal.
2. **Two-file fixture mirror** — backend uses `Date` objects (Prisma takes Date or ISO; tests want Date for groupBy/findMany shape consistency); frontend uses ISO strings (matches snapshot API wire format). Same 10-courier identity / distribution / IDs across both.
3. **Inline `prisma.keetaDailyMetrics` + `prisma.notification` mocks** — only 3 test files need them in Wave 0; promoting to `mocks/config.ts` would touch a shared file unrelated to Phase 7. Wave 1 can decide whether the pattern is widely-enough used to promote.
4. **NIT1 + B3 + B4 + W4 + W5 baked into canonical test files** (rather than spread across `.NIT1.test.tsx` / `.staticClasses.test.tsx` / etc.) — the plan's frontmatter declares 8 canonical frontend test files; adding suffix variants would inflate the file count and complicate Wave 1's RED→GREEN mapping. Each NIT/B/W concern is a discrete `it()` block inside the canonical file.

## Deviations from Plan

None for the test scaffolding work — the 17 RED tests + 2 fixtures match the plan's `<files>` declarations and `must_haves.artifacts` exactly.

## Issues Encountered

**1. Atomic-commit attribution race (parallel-agent environment)**

- **What happened:** Between staging Task 2's frontend files and running `git commit`, another concurrent agent (working on `06-03` Talabat import) created commit `ea42233` which included my staged frontend test files in its tree.
- **Impact:** All 9 frontend files (8 tests + 1 fixture) ARE in the repo on the `main` branch at commit `ea42233`, exactly as written. The work product is complete. Only the attribution metadata is hybrid: Task 1's commit message correctly describes the backend tests in `cb6091d`; Task 2's frontend tests are present on `main` but their commit message (`feat(06-03): ...`) describes a different concurrent feature.
- **Verification:** `git log --oneline -- frontend/src/__tests__/components/floor/` shows `ea42233` as the introducing commit. `git show --stat ea42233 | grep -E "floor|fixtures"` confirms all 9 frontend files are present in that commit's tree.
- **Mitigation for Wave 1+:** None needed — the test files are reachable via the normal alias paths and ran RED as verified by `npx vitest run components/floor` before the unintended attribution. Wave 1 can ignore the commit-message mismatch.
- **Root cause:** No worktree branching configured (`branching_strategy: none`), so all agents share `main`. A future improvement would be to scope this orchestrator to a per-phase branch.

## Verification

**Backend RED state (from `npx jest --testPathPatterns 'floor\.|locationEventPublish|events\.tenantIsolation|liveFleetStatus\.rejectionCount|orderRejectionToday|eventBus\.darbEventType' --testTimeout 5000`):**

```
Test Suites: 9 failed, 9 total
Tests:       23 failed, 4 passed, 27 total
```

All 9 backend suites fail with the expected RED signals:
- 7 suites fail with assertion errors against not-yet-implemented routes / tools / event-publish (`Received: null` for floorRouter, `expect(received).toBeDefined()` for orderRejectionToday tool, `Received: undefined` for orderRejectionCount aggregate, etc.)
- 2 suites fail to compile with TS2322 (`Type '"gps_point"' is not assignable to type 'DarbEventType'`) — `events.tenantIsolation.test.ts` and `services/eventBus.darbEventType.test.ts`

**Existing tests untouched (regression baseline):**

```bash
cd backend && npx jest --testPathPatterns 'agent/locationIngest|agent/walkingSkeleton'
# Test Suites: 2 passed, 2 total; Tests: 5 passed, 5 total
```

**Frontend RED state (from `npx vitest run components/floor`):**

```
Test Files  8 failed (8)
     Tests  no tests
```

All 8 frontend suites fail with `Failed to resolve import "@/components/floor/<X>"` — the canonical RED state the plan's verification block declared.

**Existing frontend tests untouched:**

```bash
cd frontend && npx vitest run ai/ChatActionCard
# Test Files  1 passed (1); Tests  7 passed (7)
```

## Self-Check: PASSED

All 19 work files + SUMMARY.md verified present on disk and in git history. Both introducing commits (`cb6091d` backend, `ea42233` frontend) reachable on `main`. The frontend test files match the canonical names in the plan's `<files>` declaration. The backend tests match the names in `must_haves.artifacts`.

## Next Phase Readiness

**Wave 1 (Phase 7-01) — backend production code** can start immediately. The plan's RED→GREEN map:

| Wave 1 task | Turns GREEN |
|---|---|
| Widen `DarbEventType` union | `eventBus.darbEventType.test.ts`, `events.tenantIsolation.test.ts` |
| Wire `publishEvent` into `POST /api/agent/location` | `locationEventPublish.test.ts` |
| Extend `liveFleetStatus` with `orderRejectionCount` | `liveFleetStatus.rejectionCount.test.ts` |
| Ship `agent/tools/read/orderRejectionToday.ts` | `orderRejectionToday.test.ts` |
| Ship `routes/floor.ts` with `/snapshot` + `/counters` + `/ping` | `floor.snapshot.test.ts`, `floor.counters.test.ts`, `floor.ping.test.ts` |
| Integrate all of the above end-to-end | `floor.walkingSkeleton.test.ts` |

**Wave 2 (Phase 7-02) — frontend map primitives** turns GREEN: `LiveFloorMap`, `CourierMarker`, `useFloorRealtime`.

**Wave 3 (Phase 7-03) — frontend orchestration** turns GREEN: `LiveFloorPage`, `FloorPillCounters`, `FloorFilters`, `CourierDetailPanel`, `PingButton`.

**Wave 4 (Phase 7-04) — hardening** addresses any edge cases discovered while turning Wave 1-3 GREEN.

No blockers. Commits unpushed (per policy).

---
*Phase: 07-live-floor*
*Plan: 00*
*Completed: 2026-05-13*
