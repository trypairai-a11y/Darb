# Phase 11 Plan Verification — gsd-plan-checker

**Phase:** 11 — Trust Graduation v2 + Scheduled Briefings + Mature Memory + Partner-API Outreach
**Plans checked:** 5 (Waves 0–4, 14 tasks total)
**Verdict:** **FLAG** — plans cover the goal in spirit, but **3 BLOCKERS** require revision before execution. The architectural skeleton is sound; the breakage is concentrated in two missing schema columns and two file/symbol references that don't exist in the codebase.

---

## Summary

| Dimension | Status | Notes |
|-----------|--------|-------|
| 1. Requirement Coverage | PASS | All 6 REQs (4 REQ-* + DI-01-01 + DI-01-02) appear in `requirements:` frontmatter; each has covering tasks |
| 2. Task Completeness | PASS | All 14 tasks have files/action/verify/done |
| 3. Dependency Correctness | PASS | DAG is valid: 00 → [01, 02, 03] → 04; no cycles; Waves 1+2+3 parallel-safe |
| 4. Key Links Planned | FAIL (1 blocker) | Plan 01 onboarding hook references a file that does not exist |
| 5. Scope Sanity | PASS | 14 tasks / 5 plans is tight but achievable; no plan exceeds 3 tasks |
| 6. Verification Derivation | PASS | must_haves are user-observable; artifacts map to truths |
| 7. Context Compliance | N/A | No CONTEXT.md exists for Phase 11 |
| 7c. Architectural Tier | PASS | All capabilities placed in the tier RESEARCH §Architectural Responsibility Map assigns |
| 8. Nyquist Compliance | FAIL — VALIDATION.md missing | Gate check 8e fails: no `11-VALIDATION.md` artifact in phase dir |
| 9. Cross-Plan Data Contracts | PASS (with note) | Wave 1's bilingual JSON parse + Wave 2's auto-approve audit row share no data path. Notification.message field naming nit (plan says "body", schema says "message") is execution-level |
| 10. CLAUDE.md Compliance | PASS | All routes use authMiddleware + tenantScope + requireSuperAdmin per Darb conventions; Anthropic SDK + Prisma 5 + BullMQ 5; try/catch + { error } error contract |
| 11. Research Resolution | FAIL | RESEARCH `## Open Questions` (lines 574–599) has 5 questions with prose "Recommendation:" but no `(RESOLVED)` suffix on the section heading |
| 12. Pattern Compliance | N/A | No PATTERNS.md exists for Phase 11 |

**Blockers:** 3. **Warnings:** 6. **Info:** 2.

---

## BLOCKERS (must fix before execution)

### B-1 — Tenant.autoApproveCapDaily column never lands (silent schema gap)

**Dimension:** Requirement Coverage + Cross-Plan Data Contracts
**Plans affected:** 00, 02, 04

- **Plan 00** (Task 0.1) adds exactly 5 Tenant columns: `trustLevel`, `briefingMorningTime`, `briefingEveningTime`, `partnerApiSecrets`, `briefingEmailRecipients`. **`autoApproveCapDaily` is NOT in the list.**
- **Plan 02 Task 2.1** step 1.3 reads `tenant.autoApproveCapDaily` and explicitly admits "default 50 if column missing — Wave 4 might add this column or we use 50 hardcoded for now". **Wave 4 (Plan 04) does NOT add this column.**
- **Plan 02 Task 2.3** GET handler returns `{ ..., autoApproveCapDaily, ... }` and POST handler accepts + writes `autoApproveCapDaily` via `tenant.update`. This will fail Prisma client typecheck.
- **Plan 04 Task 4.3** post-deploy founder instruction reads `POST .../trust { "autoApproveCapDaily": 50 }` as if the column persists.

**Plus a related sub-gap:** RESEARCH Pitfall 6 + Plan 00 Task 0.2 test line 322 reference `Tenant.toolTrustState` JSON column for per-tool 60-day demotion (one of the 5 truths in Plan 02 must_haves). That column is also **never added** in Plan 00's schema delta.

**Fix:** Plan 00 must add 2 more Tenant columns OR Plan 02 must store cap + per-tool demotion state somewhere that exists (Redis-only for cap, separate `TenantTrustState` table for per-tool, or `Tenant.settings` JSON). Recommend:
```prisma
trustLevel               Int   @default(0)
briefingMorningTime      String @default("07:00")
briefingEveningTime      String @default("18:00")
partnerApiSecrets        Json?
briefingEmailRecipients  Json  @default("[]")
autoApproveCapDaily      Int   @default(50)
toolTrustState           Json  @default("{}")
```
…and update Plan 00 migration.sql to 7 ADD COLUMN IF NOT EXISTS rows. Update Plan 00 Task 0.1 done criteria from "5 fields" to "7 fields".

**Owner:** Plan 00 (extend migration); Plan 02 (drop `// might use 50 hardcoded` hedge — read from column).

---

### B-2 — Plan 02 trustGraduation.ts imports `getConnection` from a file where it is not exported

**Dimension:** Key Links Planned + Task Completeness
**Plan affected:** 02 (Task 2.1, step 1)

Plan 02 Task 2.1 step 1 specifies:
> Imports: prisma from ../config, **getConnection from ../queues/scheduledBriefingsWorker** (to reuse IORedis singleton OR create new), recordMetricEvent from ./metricEvent, crypto from node.

But `backend/src/queues/scheduledBriefingsWorker.ts:66` defines `getConnection` as a **file-local non-exported function**. Importing it will fail at TypeScript compile time. The Redis sliding-window-log rate cap (RESEARCH Pattern 4 — the entire enforcement mechanism for T-11-W2-02 rate-bypass) cannot land as written.

**Fix:** Either (a) export `getConnection` from `scheduledBriefingsWorker.ts` (low-risk; Phase 11 will spawn 3 more workers that all need it), or (b) read `backend/src/config/redis.ts` default export instead, or (c) instantiate a fresh `IORedis` in `trustGraduation.ts` with the same connection options. Recommend option (a) — refactor `getConnection` to an exported singleton in a shared module (e.g. `backend/src/queues/connection.ts`) and have `scheduledBriefingsWorker.ts` + `memoryPruneWorker.ts` + `partnerApiPullWorker.ts` + `trustGraduation.ts` all consume it. Update plans 01, 02, 03 accordingly.

**Owner:** Plan 02 Task 2.1 action step 1.

---

### B-3 — Plan 01 "onboarding hook" key_link targets a file that does not exist

**Dimension:** Key Links Planned
**Plan affected:** 01 (Task 1.3)

Plan 01 `files_modified` lists `backend/src/services/onboarding/onboardingService.ts` and key_link says `from: "onboardingService.createTenant" to: "briefingProvisionService.provisionDefaultBriefings"`. But the codebase has only:
- `backend/src/services/onboarding/index.ts` — a 3-line barrel re-exporting `reportBuilder`
- `backend/src/services/onboarding/reportBuilder.ts` — Phase 2 "read on your fleet" report

Actual tenant creation lives in **`backend/src/routes/admin/onboarding.ts`** (verified: contains `tenant.create({ data: { name, subscriptionPlan: "TRIAL", designPartner, monthlyOverrideKd, ... } })`).

Plan 01 Task 1.3 action step 3 hedges with "if it doesn't exist, identify the actual onboarding entry via grep" — but the verify command (`grep -c "provisionDefaultBriefings" src/services/onboarding/*.ts`) will return **0**, and the plan's `done` criterion ("onboardingService creates briefings post-tenant-create") cannot be verified mechanically. More importantly, the integration WILL miss tenants created through `routes/admin/onboarding.ts` — which is the only real onboarding path.

**Fix:** Update Plan 01 to target `backend/src/routes/admin/onboarding.ts` (the actual `tenant.create` site). Update `files_modified`, `key_links` from→to wording, and the verify command's grep target. The post-create call site is in the route handler immediately after `tenant.create({ ... })`.

**Owner:** Plan 01 Task 1.3 action steps 3 + verify command + key_link entry.

---

## WARNINGS (should fix; execution can proceed)

### W-1 — Plan 04 Task 4.2 targets a Notification baseline migration that does not exist

**Dimension:** Key Links Planned + Task Completeness
**Plan affected:** 04

Plan 04's `files_modified` lists `backend/prisma/migrations/20260420000000_notifications_baseline/migration.sql`. **No such directory exists.** Verified by `ls backend/prisma/migrations/`:
- earliest matching prefix is `20260420180000_talabat_daily_metrics`
- the actual file containing `ALTER TABLE "Notification"` is **`20260414180000_keeta_parity_f7_f14/migration.sql`** (line: `ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;`)

The DI-01-02 surgical fix (D-05) is correct in spirit (prepend `CREATE TABLE IF NOT EXISTS "Notification" (...)` to the earliest ALTER), but the file path is wrong. Plan 04 Task 4.2 action step 1 does correctly say "identify the affected baseline migrations" via grep — so the executor will find the real file at runtime. But `files_modified` frontmatter + verify command (`grep -c "CREATE TABLE IF NOT EXISTS \"Notification\"" prisma/migrations/*/migration.sql`) will still resolve via wildcard. **The plan will likely succeed, but the frontmatter is dishonest** — fix it.

**Fix:** Replace `20260420000000_notifications_baseline/migration.sql` with `20260414180000_keeta_parity_f7_f14/migration.sql` in Plan 04 frontmatter + key_link. Update both `from:` and `pattern:` accordingly.

---

### W-2 — RESEARCH §"Open Questions" not marked RESOLVED

**Dimension:** Research Resolution (#1602)

RESEARCH.md has section `## Open Questions` (line 574) with 5 prose questions. Each has a `Recommendation:` line but the section heading lacks the `(RESOLVED)` suffix, and individual questions are not tagged `RESOLVED`. Per Dimension 11, this is a fail.

The questions are substantively answered (default trustLevel=0, auto-approved in /decisions audit, 30d backfill on partner-API enable, evening briefings always send, surgical DI-01-02 fix). The plans implement each recommendation. The gap is purely cosmetic on RESEARCH.md.

**Fix:** Either (a) rename section to `## Open Questions (RESOLVED)` and add `— RESOLVED: <one-line>` to each, or (b) acknowledge in the report that the recommendations match the plan decisions D-01..D-05 and the section is effectively closed.

---

### W-3 — VALIDATION.md missing (Nyquist gate 8e)

**Dimension:** Nyquist Compliance

Per check 8e: `.planning/phases/11-trust-v2-briefings/11-VALIDATION.md` does not exist. The phase has a "Validation Architecture" block in RESEARCH.md (lines 622–671) and Wave 0 stages 9 RED tests + `test-fresh-migrate.sh`, but the **standalone VALIDATION.md artifact** is absent.

The Nyquist gate (8a–d) substantively passes if you read the plans manually:
- Every implementation task has `<automated>` verify commands (npm test / npx jest / grep)
- Wave 0 ships RED tests for all 5 production-code waves before they begin (TDD discipline)
- No `--watchAll`; no E2E suite as the only signal; sampling is per-test-file (good)

But the gate is technically blocking per the dimension spec. The orchestrator must decide whether to (a) waive 8e because the testing strategy is sound but uncodified, or (b) require a VALIDATION.md scaffold before execution.

**Fix:** Either run `/gsd-plan-phase 11 --research` to regenerate the validation artifact, or accept this as a known divergence and proceed.

---

### W-4 — Plan 02 trustGraduation.ts test for rate-limit cap is a no-op assertion

**Dimension:** Task Completeness + Verification Derivation
**Plan affected:** 02 (Task 2.1 step 4, "rate-limit cap" test)

Plan 02 Task 2.1 step 4 third test ("51st auto-approve in 24h"):
> The test asserts the *contract*; Wave 2 ensures it passes.
> `expect(decision).toHaveProperty("autoApprove");`

This is a tautological assertion — every result object has `autoApprove`. The cap-exhausted case is NOT actually verified. The plan even acknowledges "Implementation in Wave 2 must seed counter > cap" but never specifies how. Without an explicit Redis-seed step, this test passes on a fresh queue regardless of whether the cap works.

**Fix:** Tighten the test: pre-fill the Redis sorted set with `cap` entries via direct `redis.zadd` in `beforeEach`; assert `decision.autoApprove === false` AND `decision.reasoning` matches `/rate|cap/i`. Same fix pattern Plan 02 applies later (line 229) to the rewritten test — apply consistently.

---

### W-5 — Plan 02 seed.ts SYSTEM_AUTO_APPROVE_USER_ID assumes a tenantId

**Dimension:** Task Completeness + Threat Model
**Plan affected:** 02 (Task 2.1 step 3)

Plan 02 says:
> `tenantId: <first-tenant-or-system-tenant-id>,  // adjust based on existing seed.ts shape`

The User model (schema.prisma line 453–489) requires `tenantId String` with FK to Tenant.id. A "system user" living in a real tenant's namespace is **architecturally wrong** — its `AgentAction.approverId` rows then look as if a normal user of that tenant approved them, leaking the audit signal.

Either (a) Tenant.id must be a special "system" tenant seeded first (one extra row in seed.ts), or (b) User.tenantId becomes nullable (large change), or (c) the synthetic user is keyed by `id = "system:auto-approve"` and joined to whatever tenant the FK demands but tooling agrees to treat the literal id `"system:auto-approve"` as a sentinel — and Phase 2's `/decisions` audit projector must filter accordingly.

**Fix:** Add to Plan 02 Task 2.1 step 3 — either seed a `Tenant { id: "system", name: "System" }` row first, or add explicit `tenantId` derivation logic. Document the sentinel in a code comment near `SYSTEM_AUTO_APPROVE_USER_ID`. Also: User.email has `@unique`; the upsert must be `where: { email: "system+auto-approve@darb.internal" }` (not by id) to be idempotent across re-seeds.

---

### W-6 — Plan 02 Task 2.3 has no real test for admin trust route

**Dimension:** Verification Derivation
**Plan affected:** 02 (Task 2.3 step 4)

Plan 02 Task 2.3 step 4 says the admin route test is "OPTIONAL polish — the route handler doesn't need to be GREEN-tested in Wave 2 as long as it compiles and lint:tenant passes. Phase verification in Wave 4 will exercise it end-to-end."

But Plan 04 (Wave 4) contains **no** end-to-end exercise of `/api/admin/tenants/:id/trust`. The verification list (line 439–449) checks lint, migration, and full `npm test` only — it never invokes the route.

The truth in Plan 02 must_haves "Admin endpoint POST /api/admin/tenants/:id/trust allows founder to set trustLevel + autoApproveCapDaily" cannot be observed by execution.

**Fix:** Plan 02 Task 2.3 step 4 — make the smoke test mandatory (3 cases: happy-path 200, non-super-admin 403, out-of-range 400). Or push to Plan 04 with an explicit task entry.

---

## INFO (suggestions; no fix required)

### I-1 — Notification field rename

Plan 01 Task 1.2 says "body english.substring(0,280), bodyAr arabic.substring(0,280)". The actual schema (schema.prisma line 1626–1641) has `message String` (not `body`). The plan must map `english` → `message` field name at write time. Minor execution detail; flag at code-review time.

### I-2 — Plan 02 fast-path performance test is observability, not validation

Plan 02 Task 2.1 done criterion #5 requires sub-5ms branch for non-allow-listed tools. Jest's microbenchmark timing is noisy; one slow CI run produces a false negative. Consider asserting "no DB call was made" (mock prisma) instead of wall-clock latency. The sub-1ms goal is observable via OpenTelemetry / metricEvent counters, not Jest.

---

## What I checked (evidence)

- ROADMAP Phase 11 entry: goal matches phase folder + plans' coverage. REQ IDs verified in REQUIREMENTS.md lines 56–59, 168–172.
- All 4 REQs + 2 DIs appear in at least one plan's `requirements:` frontmatter. DI-01-01 + DI-01-02 are claimed by Plan 00 (scaffold) + Plan 04 (closeout). ✓
- DAG: 00→[01,02,03]→04 confirmed in `depends_on:` fields. No cycles. Wave 1+2+3 parallel-safe — verified each declares `depends_on: [00]` only. ✓
- Trust gate fast-path (RESEARCH Pattern 3) — `evaluateTrustGate` returns autoApprove:false in sub-1ms when `TOOL_TRUST_CONFIG[toolName]?.allowAutoApprove !== true`. Code path is documented in Plan 02 Task 2.1 step 1.1. ✓ (subject to W-4 above)
- Pitfall 8 (audit-after-execute): registry.ts modification in Plan 02 Task 2.2 places `writeAutoApprovedAction` INSIDE the try/catch of `tool.execute`. ✓
- Pitfall 6 (per-tool demotion): Plan 02 truths #3 says "per-tool 60-day demotion window". RESEARCH says state lives in `Tenant.toolTrustState` JSON. **State column missing from Plan 00 migration → BLOCKER B-1.**
- Trust gate sub-1ms branch: fast-path correctness checked above. ✓
- `applyPenalty` / `suspendDriver` NEVER auto: Plan 02 Task 2.1 step 1 explicit deny entries `allowAutoApprove: false`. ✓
- T-11-W2-01..07: covered in Plan 02 §threat_model with dispositions. ✓
- T-11-W3-01..08: covered in Plan 03 §threat_model. ✓
- T-11-W1-01..05: covered in Plan 01 §threat_model. ✓
- DI-01-02 surgical: Plan 04 Task 4.2 prepends CREATE TABLE IF NOT EXISTS to 2 baseline migrations. ✓ in approach. **Migration path for Notification is wrong → W-1.**
- Anthropic prompt cache (Pattern 2 + Pitfall 7): Plan 01 Task 1.2 wires `cache_control: { type: "ephemeral", ttl: "1h" }` on the SYSTEM prompt only; tenant context in messages[]. ✓
- AES-256-GCM partner-API creds (Pitfall 5): Plan 03 Task 3.2 uses `portalCreds.encryptCred`; job payload is `{ tenantId, platform }` only; T-11-W3-01 mitigated. ✓
- 30d backfill (D-03): Plan 03 Task 3.1 `resolveRangeOrBackfill` helper forces 30d when `lastSyncedAt` is null. ✓
- HTTPS-only baseUrl (V9): Plan 03 Task 3.1 `validateHttpsUrl` helper rejects non-https. ✓
- Memory compaction NOT delete (Pattern 5): Plan 02 Task 2.2 `compactMemoriesForTenant` writes a synthetic `source='observation_compressed'` row; exemption list covers founder_pinned + user_correction + `dismissed:%` + `value.protected=true`. ✓
- Cron stagger (Pitfall 4): Plan 01 Task 1.3 `computeStagger(tenantId) = parseInt(tenantId.slice(0,8).replace(/[^0-9a-f]/gi,'a'), 16) % 5`. ✓
- Anti-T-02-01: trust gate sets `ctx.userId` LOCALLY inside `invoke()`. runtime.ts:169-171 monitor-no-userId assertion fires at run start only, not inside invoke(). Reassignment is via `ctx = { ...ctx, userId: ... }` — does NOT leak to runtime.ts caller. ✓
- ScheduledBriefing model already exists (schema.prisma:2457–2479); briefingProvisionService can reuse `createBriefing` directly. ✓
- Notification.titleAr/bodyAr/category already in schema (lines 1626–1641). ✓
- AgentAction.source already supports `"auto"` per ledger.ts:32. ✓
- registry.ts approval gate insertion site at line 149 — verified, exists as documented. ✓

---

## Recommended action

**FLAG — return to planner with 3 blockers (B-1, B-2, B-3) + 6 warnings.**

The plans are 90% there. The 3 blockers are all small, surgical fixes:
1. Plan 00 schema: add 2 columns (`autoApproveCapDaily`, `toolTrustState`)
2. Plan 02 import: export `getConnection` from a shared queue-connection module
3. Plan 01 onboarding hook: redirect to `routes/admin/onboarding.ts`

After these 3 are addressed, the warnings can be batched into a single revision and the phase is ready to execute. The architectural shape (trust gate insertion, AES-256-GCM credential envelope, append-only memory compaction, surgical DI-01-02 prepend) is sound. The threat models are thorough. The verify-then-extend TDD discipline (Wave 0 RED → Wave 1+2+3 GREEN → Wave 4 closeout) is correctly applied.

Re-verification budget after revision: 1 loop should suffice — these are all factual gaps, not design ambiguities.

