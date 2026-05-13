---
phase: 06-ingest-adapter-layer
plan: 01
subsystem: api
tags: [typescript, prisma, express, ingest, adapter, composite-pattern, xlsx, audit-trail]

# Dependency graph
requires:
  - phase: 06-ingest-adapter-layer
    provides: "Wave 0 RED test scaffolding (services/ingest/{types,composite,registry,audit,normalize}.test.ts, orderSourceMobileGps.test.ts, _lintNegative.test.ts, compositeFetchCash.test.ts) plus lint:tenant scope extension"
provides:
  - "IngestAdapter TypeScript contract — the single interface every per-source adapter implements (mobile / scraper / OCR / XLSX / email)"
  - "CompositeAdapter with NotAvailable fallthrough + non-NotAvailable error propagation (Pitfall 4)"
  - "getAdapter(platform, ctx) registry factory returning empty-tier CompositeAdapters per Platform (Wave 2 fills tiers)"
  - "writeIngestRun audit helper persisting to existing IngestRun model (errorLog trimmed to 4000 chars)"
  - "Shared normalizers: parseLocalDate, parseMoneyKwd, normaliseDriverName"
  - "makeXlsxImportRoute factory replacing the inline XLSX-upload pattern from routes/keeta.ts:376-470"
  - "OrderSource enum + MOBILE_GPS value (additive migration 20260513130000_add_mobile_gps_order_source)"
affects:
  - 06-02a (Keeta + Talabat per-platform adapters fill registry tiers)
  - 06-02b (Deliveroo + Americana per-platform adapters fill registry tiers)
  - 06-03 (routes/talabat.ts + routes/deliveroo.ts mount makeXlsxImportRoute)
  - 06-04 (pullChunkPhase6 BACKWASH worker consumes CompositeAdapter + writeIngestRun)
  - 05 (mobile GPS adapter — uses MOBILE_GPS OrderSource value when persisting OrderLog rows)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite + Strategy: CompositeAdapter holds ordered tiers; per-method dispatch falls through on NotAvailable; non-NotAvailable errors propagate (never swallow scraper failures)"
    - "Factory pattern: getAdapter(platform, ctx) returns the per-platform composite (Wave 1 returns empty composites; Wave 2 fills)"
    - "Route handler factory: makeXlsxImportRoute(platform) builds an Express handler from getAdapter + ingestXlsx + writeIngestRun — Wave 3 mounts in routes/talabat.ts + routes/deliveroo.ts"
    - "Audit pattern: writeIngestRun collapses keetaPortalScraperWorker's create+update sequence into one call; trims errorLog to 4000 chars (T-06-03)"

key-files:
  created:
    - backend/src/services/ingest/types.ts
    - backend/src/services/ingest/composite.ts
    - backend/src/services/ingest/registry.ts
    - backend/src/services/ingest/audit.ts
    - backend/src/services/ingest/normalize.ts
    - backend/src/services/ingest/index.ts
    - backend/src/services/ingest/xlsxRouteFactory.ts
    - backend/prisma/migrations/20260513130000_add_mobile_gps_order_source/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/__tests__/mocks/config.ts
    - backend/src/__tests__/services/ingest/audit.test.ts
    - backend/src/__tests__/services/ingest/orderSourceMobileGps.test.ts
    - backend/src/generated/prisma/*

key-decisions:
  - "Empty composites in Wave 1: registry.getAdapter returns CompositeAdapter(platform, []) for every Platform; Wave 2 plans push concrete tier arrays. Keeps Wave 1 blast radius tight while letting downstream waves run in parallel."
  - "Audit helper trims errorLog to 4000 chars before insert (T-06-03 — prevents bloating IngestRun rows with full stack traces or credential-bearing payloads). Matches existing pattern from keetaPortalScraperWorker.ts:91."
  - "DI-01-02 shadow-DB fallback used for the MOBILE_GPS migration: prisma db push → hand-craft migration.sql with ADD VALUE IF NOT EXISTS → migrate resolve --applied. Consistent with Phase 1+2+3+4 fallbacks."
  - "Pitfall 4 (composite never silently swallows errors): CompositeAdapter catches only `instanceof NotAvailable`; every other Error re-throws so scraper-side failures surface to callers. Pinned by composite.test.ts test 4 (Error('boom') propagates)."
  - "Wave 1 deviates from the plan's `prisma migrate dev` step ONLY by following the documented DI-01-02 fallback when the shadow-DB rebuild fails on a pre-existing baseline. Per WARNING 9 fix, schema + migration still land together in this plan, not deferred."

patterns-established:
  - "Adapter layer: services/ingest/ is the single home for ingestion code; per-platform Wave 2 adapters live in services/ingest/{keeta,talabat,deliveroo,americana}/"
  - "Test config indirection: services nested 3 levels deep that need the prisma mock should use jest.mock(\"../../../config\", () => require(\"../../mocks/config\")) — matches the scoreExplainer + performanceTrend idiom"
  - "Mocks/config.ts is the canonical mock prisma surface — Wave 1 added ingestRun.{create,findFirst,findMany,update}"
  - "Custom prisma generator output: tests must import enums from ../generated/prisma (or a relative variant), NOT from @prisma/client (the stale node_modules/.prisma/client/ doesn't reflect post-schema-change generations)"

requirements-completed:
  - REQ-ingest-adapter-layer

# Metrics
duration: ~8 min
completed: 2026-05-13
---

# Phase 6 Plan 01: Ingest Adapter Layer Wave 1 Summary

**IngestAdapter contract + CompositeAdapter precedence chain + getAdapter factory + writeIngestRun audit helper + shared normalizers + makeXlsxImportRoute factory + OrderSource.MOBILE_GPS migration.**

## Performance

- **Duration:** ~8 min (Task 1 → Task 3, wall-clock between first and last commit)
- **Started:** 2026-05-13T04:00:01Z (approximate — Task 1 commit time)
- **Completed:** 2026-05-13T04:07:56Z (Task 3 commit time)
- **Tasks:** 3
- **Files modified/created:** 13 (7 new TypeScript files, 1 new migration, 1 schema edit, 4 test/mock + generated client updates)

## Accomplishments

- Single TypeScript contract — `IngestAdapter` — that every per-source adapter (mobile / scraper / OCR / XLSX / email) implements. CON-scraper-replaceable is now enforceable: swapping a scraper for an XLSX import is a tier reorder, not a rewrite.
- `CompositeAdapter` with strict Pitfall-4 semantics: catches only `NotAvailable`, every other `Error` propagates. Tier-1 fallthrough verified by Wave 0's `composite.test.ts` (6 tests).
- `getAdapter(platform, ctx)` factory: per-Platform composites with empty tier arrays in Wave 1. Wave 2 plans push the concrete tiers without touching this signature.
- `writeIngestRun` audit helper: collapses `keetaPortalScraperWorker.ts:33-95`'s create+update pattern into one call; trims `errorLog` to 4000 chars (T-06-03 mitigation).
- Shared normalizers (`parseLocalDate`, `parseMoneyKwd`, `normaliseDriverName`) generalised from existing parsers (Pitfall 1 — don't hand-roll).
- `makeXlsxImportRoute(platform)`: Express handler factory implementing RESEARCH.md Pattern 5. Wave 3 will mount it in `routes/talabat.ts` + `routes/deliveroo.ts` with `authMiddleware + tenantScope + multer` upstream (T-06-06).
- `OrderSource.MOBILE_GPS` enum value + additive migration. Per WARNING 9 fix the schema change and its migration land together here (not deferred to Wave 4).

## Task Commits

Each task was committed atomically:

1. **Task 1: types.ts + composite.ts + audit.ts + normalize.ts + index.ts** — `2a9034a` (feat)
2. **Task 2: registry.ts + xlsxRouteFactory.ts (empty composites)** — `e71e9ee` (feat)
3. **Task 3: MOBILE_GPS enum value + migration** — `5d5a947` (feat)

_(SUMMARY.md + STATE.md update will be committed separately as `docs(06-01): complete ...`.)_

## Files Created/Modified

### Created (8)

- `backend/src/services/ingest/types.ts` — `IngestAdapter` interface, `NotAvailable` Error subclass, `NormalizedRow<T>`, `AdapterSource` union (with `MOBILE_GPS`), `Platform` alias, `DateRange`, `XlsxIngestResult`.
- `backend/src/services/ingest/composite.ts` — `CompositeAdapter` class with per-method dispatch and tier fallthrough on `NotAvailable`.
- `backend/src/services/ingest/registry.ts` — `getAdapter` factory returning per-Platform `CompositeAdapter` with empty tier arrays (Wave 2 fills).
- `backend/src/services/ingest/audit.ts` — `writeIngestRun(args)` helper persisting tenant-scoped IngestRun rows.
- `backend/src/services/ingest/normalize.ts` — `parseLocalDate`, `parseMoneyKwd`, `normaliseDriverName`.
- `backend/src/services/ingest/index.ts` — barrel re-exports.
- `backend/src/services/ingest/xlsxRouteFactory.ts` — `makeXlsxImportRoute(platform)` Express handler factory.
- `backend/prisma/migrations/20260513130000_add_mobile_gps_order_source/migration.sql` — `ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'MOBILE_GPS'`.

### Modified (5 paths)

- `backend/prisma/schema.prisma` — appended `MOBILE_GPS` to `OrderSource` enum (1 line, additive).
- `backend/src/__tests__/mocks/config.ts` — added `ingestRun: {create, findFirst, findMany, update}` to the canonical mock prisma stub (deviation; see below).
- `backend/src/__tests__/services/ingest/audit.test.ts` — switched the inline `jest.mock("../../../config", () => ({...}))` factory to `() => require("../../mocks/config")` so the production-side import path and the test's mock converge on the same prisma instance (deviation; see below).
- `backend/src/__tests__/services/ingest/orderSourceMobileGps.test.ts` — switched `import {OrderSource} from "@prisma/client"` to `from "../../../generated/prisma"` so the import resolves to the freshly-generated client (deviation; see below).
- `backend/src/generated/prisma/*` — output of `prisma generate` after schema edit: `edge.js`, `index-browser.js`, `index.d.ts`, `index.js`, `package.json`, `schema.prisma`, `wasm.js` all now expose `OrderSource.MOBILE_GPS`.

## Decisions Made

- **Empty composites in Wave 1:** Registry returns `CompositeAdapter(platform, [])` for every Platform. Wave 2 plans push concrete tier arrays. Keeps Wave 1 blast radius small while letting Wave 2 plans (per-platform adapters) run in parallel.
- **Audit helper trims `errorLog` to 4000 chars:** T-06-03 mitigation. The schema's `errorLog` column is `String?` with no DB-side cap; trimming at the writer level prevents bloating rows with full stack traces or credential-bearing payloads.
- **DI-01-02 shadow-DB fallback for the migration:** `prisma migrate dev` failed at P3006 on the pre-existing `20260407010000_add_platform_settings_fields` baseline. Used the documented fallback path: `prisma db push --skip-generate` → hand-craft `migration.sql` with `ADD VALUE IF NOT EXISTS` → `prisma migrate resolve --applied` → `prisma generate`. Consistent with Phase 1+2+3+4 SUMMARYs.
- **Pitfall 4 semantics:** `CompositeAdapter.dispatchFetch` catches only `instanceof NotAvailable`; every other `Error` re-throws so scraper-side failures surface to callers. Verified by `composite.test.ts` test 4 (`Error('boom')` re-thrown). The `ingestXlsx` path uses the same strict semantics — first tier with a handler wins.

## Deviations from Plan

Three Rule-3 (blocking infra mismatch) auto-fixes; one DI-01-02 shadow-DB fallback. Documented inline in task commits:

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Audit test inline `jest.mock` factory + production-side mapper diverged**
- **Found during:** Task 1 (audit.ts verification)
- **Issue:** Wave 0's `audit.test.ts` used `jest.mock("../../../config", () => ({prisma: {...}}))` with an inline factory. The test's `import { prisma } from "../../../config"` resolves at 3 levels (no mapper match) → real `src/config/index.ts` → returns the inline factory. But `audit.ts` imports at 2 levels (`"../../config"`) — the 2-level mapper rewrites that to `src/__tests__/mocks/config.ts`. The two paths returned different prisma instances, so test assertions on the inline mock never saw production-side calls.
- **Fix:** Switched the test to `jest.mock("../../../config", () => require("../../mocks/config"))`. This matches the existing test idiom (`scoreExplainer.test.ts` + `performanceTrend.test.ts` use the same pattern). Both paths now converge on the shared `mocks/config.ts` prisma stub.
- **Files modified:** `backend/src/__tests__/services/ingest/audit.test.ts`
- **Verification:** All 4 `audit.test.ts` tests pass with the fix; agent/tools tests (30) unaffected.
- **Committed in:** `2a9034a` (Task 1).

**2. [Rule 3 - Blocking] Mocks/config.ts missing `ingestRun` delegate**
- **Found during:** Task 1 (audit test runtime — `prisma.ingestRun.create` was `undefined`).
- **Issue:** Wave 1's audit + audit-consuming adapters all reach for `prisma.ingestRun.create`. The shared `mocks/config.ts` had no `ingestRun` stub, so any production code that imports prisma via the 2-level path crashed in tests.
- **Fix:** Added `ingestRun: {create, findFirst, findMany, update}` to the mocks/config.ts prisma stub. Documented inline that this surfaces the delegate every Wave 1+ ingest test reaches for.
- **Files modified:** `backend/src/__tests__/mocks/config.ts`
- **Verification:** Audit tests pass; agent/tools tests unaffected (the mock object spread still works for all existing models).
- **Committed in:** `2a9034a` (Task 1).

**3. [Rule 3 - Blocking] `orderSourceMobileGps.test.ts` imported from `@prisma/client` but custom output stales it**
- **Found during:** Task 3 (post-`prisma generate` verification).
- **Issue:** Darb's prisma generator writes to `../src/generated/prisma` (custom output). The default `node_modules/.prisma/client/` is stale (last touched 2026-04-06) and never regenerated. The Wave 0 test imported `import { OrderSource } from "@prisma/client"` — `@prisma/client` re-exports from `.prisma/client/default` → stale index → no `MOBILE_GPS`. Test always RED regardless of migration state.
- **Fix:** Switched the test to `import { OrderSource } from "../../../generated/prisma"` — the project's canonical generated path (every other test in the repo uses this idiom).
- **Files modified:** `backend/src/__tests__/services/ingest/orderSourceMobileGps.test.ts`
- **Verification:** Test GREEN after the import fix + migration.
- **Committed in:** `5d5a947` (Task 3).

### Process Deviation (Documented Fallback)

**4. [Plan's documented fallback — not a Rule deviation] DI-01-02 shadow-DB fallback used for `prisma migrate dev`**
- **Found during:** Task 3 (`prisma migrate dev --name add_mobile_gps_order_source`).
- **Issue:** Standard `migrate dev` failed at P3006 → P1014: "Migration `20260407010000_add_platform_settings_fields` failed to apply cleanly to the shadow database. The underlying table for model `PlatformSettings` does not exist." This is the pre-existing baseline-defect documented in Phase 1+2+3+4 SUMMARYs.
- **Fix:** Followed the documented fallback path the plan explicitly authorizes:
  1. `npx prisma db push --skip-generate` — applied to dev DB
  2. Hand-crafted `migration.sql` with `ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'MOBILE_GPS'`
  3. `npx prisma migrate resolve --applied 20260513130000_add_mobile_gps_order_source`
  4. `npx prisma generate` — regenerated `src/generated/prisma/*` with `MOBILE_GPS`
- **Verification:** `grep -c MOBILE_GPS backend/prisma/schema.prisma` = 1; new migration directory exists; zero destructive ops (`grep -cE "DROP|DELETE|TRUNCATE|RENAME"` = 0); `orderSourceMobileGps.test.ts` GREEN; `prisma migrate resolve --applied` succeeded.
- **Committed in:** `5d5a947` (Task 3).

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking infra mismatch in Wave 0 RED tests / mocks) + 1 documented fallback (DI-01-02 — planned for explicitly).
**Impact on plan:** All three Rule-3 fixes are infra-quality issues in Wave 0 scaffolding that the plan's GREEN-target tests couldn't have passed without correcting. Zero scope creep. The DI-01-02 fallback was authorized by the plan up front.

## Issues Encountered

- **Concurrent Phase 5 commits during Task 2:** Phase 5 mobile work landed commits between my Task 1 and Task 2. My initial Task 2 `git add` (which only listed Wave-1 files) ended up in a commit that also captured staged-but-not-yet-committed Phase 5 mobile files. I soft-reset the dirty Task 2 commit, unstaged everything, re-staged only the 3 Wave-1 files, and committed cleanly (`e71e9ee`). The Phase 5 work landed in its own commits (`a37e916`, `579e0d0`, `470155d`) afterward. Net effect on Phase 6: zero — final Task 2 commit is clean and contains only ingest scaffolding.

## Threat Flags

None. Wave 1 introduces no new network endpoints, auth paths, file access patterns, or trust-boundary changes beyond what the plan's `<threat_model>` already covered (T-06-01..T-06-06). `xlsxRouteFactory.ts` defines a request handler but does NOT mount any new route — Wave 3 mounts it under `authMiddleware + tenantScope + multer`.

## User Setup Required

None — no external service configuration required.

## Self-Check: PASSED

- All 7 new TypeScript files exist under `backend/src/services/ingest/`: `types.ts`, `composite.ts`, `registry.ts`, `audit.ts`, `normalize.ts`, `index.ts`, `xlsxRouteFactory.ts`.
- Migration directory `backend/prisma/migrations/20260513130000_add_mobile_gps_order_source/` exists with `migration.sql` (2 MOBILE_GPS occurrences, 0 destructive ops).
- 6 Wave-0 RED test suites GREEN: `types.test.ts` (4), `composite.test.ts` (6), `registry.test.ts` (4), `audit.test.ts` (4), `normalize.test.ts` (6), `orderSourceMobileGps.test.ts` (1) — 25 tests total.
- Phase 1+2 regression tests GREEN: 9 suites / 25 tests (queues/onboardingBackwashWorker, agent/walkingSkeleton, decisions, billing, onboarding).
- `cd backend && npm run lint:tenant` exits 0.
- `cd backend && npx tsc --noEmit` reports zero new errors in `services/ingest/{types,composite,registry,audit,normalize,index,xlsxRouteFactory}.ts`.
- No new npm packages: `git diff HEAD~3 HEAD -- backend/package.json` is empty.
- Commits exist: `2a9034a` (Task 1), `e71e9ee` (Task 2), `5d5a947` (Task 3).

## Next Phase Readiness

- **Wave 2a/2b (per-platform adapters):** Ready to consume `IngestAdapter` + `CompositeAdapter` + `getAdapter`. The registry's switch statement needs concrete tier arrays — that's the only edit point.
- **Wave 3 (route mounting):** `makeXlsxImportRoute` is ready to mount in `routes/talabat.ts` + `routes/deliveroo.ts` with `authMiddleware + tenantScope + multer` upstream.
- **Wave 4 (BACKWASH worker):** `pullChunkPhase6` is the missing module — `compositeFetchCash.test.ts` remains intentionally RED until Wave 4 ships it. `CompositeAdapter.fetchCash` already conforms to the contract (returns `[]` when no tier has data).
- **Phase 5 (mobile GPS):** The `MOBILE_GPS` OrderSource enum value is now available — the mobile GPS-stamped order-capture flow can persist OrderLog rows with `source: "MOBILE_GPS"`.

No blockers carry into Wave 2.

---
*Phase: 06-ingest-adapter-layer*
*Completed: 2026-05-13*
