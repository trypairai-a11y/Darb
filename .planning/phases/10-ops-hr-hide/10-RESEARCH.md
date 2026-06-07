# Phase 10: Operations Per-Platform + HR + Hide-Behind-Flag — Research

**Researched:** 2026-05-13
**Domain:** Tenant-scoped per-platform UX polish, HR workbench unification, and a tenant-level feature flag (`enabledPlatforms`) that gates ~50 legacy pages without deleting code.
**Confidence:** HIGH for the existing data model (Driver / Vehicle / Penalty / DriverRestriction / Document-on-Driver columns are already shipped). HIGH for the flag mechanic (additive Json column on Tenant, no migration risk). MEDIUM for the HR workbench shell (Phase 8's `/finance/*` layout pattern is the template, but `/hr/*` doesn't exist yet). LOW for equipment serial-number policy and certain document-expiry agent proposal shapes where the PRD is non-prescriptive.

## Summary

Phase 10 is a polish + consolidation phase, not a greenfield phase. The Driver / Vehicle / Penalty / DriverRestriction / Appeal / Document-expiry data already exists [VERIFIED: backend/prisma/schema.prisma:490, :639, :1798, :581, :1817, :515-528]. What's missing is (a) a single workbench shell to surface it as one cohesive HR module, (b) a tenant-level "I don't run Talabat" toggle that hides irrelevant platform tabs and 404s their backend routes, and (c) gap-filling on the per-platform CRUD/filter/export surfaces.

Three categories of work:

1. **Hide-behind-flag** — add `Tenant.enabledPlatforms` as `String[]` (Postgres native array, ideal for `has` / `hasSome` filtering — preferred over `Json` to avoid `array_contains` path quirks). Surface it through `/api/auth/me` so the frontend can hide sidebar tabs. Add a Phase-10 `requirePlatformEnabled(platform)` middleware that 404s any backend route whose path matches a disabled platform. ADMIN role bypass MUST exist or admins lock themselves out (see Pitfalls §3).
2. **HR Workbench at `/hr/*`** — single Next.js segment under `frontend/src/app/(dashboard)/hr/` consolidating Drivers list + Driver File link, Documents (expiry alerts), Vehicle assignment, Penalties + Restrictions timeline, Equipment, and Leave/Office staff. Reuses the Phase-8 left-rail-shell pattern. New backend mount: `/api/hr/*` aggregates existing routes (drivers, vehicles, penalties, driver-restrictions, leave-requests) and adds expiry + equipment endpoints. No data is renamed; we add a workbench surface over what already exists.
3. **Per-platform polish** — for each of `keeta.ts` / `talabat.ts` / `deliveroo.ts` / `americana.ts`, fill the CRUD gaps documented in §Per-Platform Polish. Notable: Keeta lacks list filters on `/metrics`; Deliveroo lacks driver detail; Americana lacks settings PUT validation; Talabat is heaviest at 1289 lines and is the reference template.

**Primary recommendation:** Land in 5 sequential waves: (W0) RED tests + Tenant.enabledPlatforms migration scaffolding; (W1) backend flag enforcement (middleware + /me payload + Equipment + DocumentExpiry models); (W2) `/hr/*` route group + workbench shell + Drivers/Documents/Vehicles tabs; (W3) Penalties/Restrictions timeline + Equipment + Leave tabs; (W4) per-platform polish sweep + sidebar conditional rendering + tenant settings UI + 404 stubs + verification.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `Tenant.enabledPlatforms` storage | Database / Storage | — | Postgres native `String[]` column; tenant-scoped; queryable via Prisma `hasSome`. [VERIFIED: prisma.io/docs/orm/prisma-schema/data-model/scalar-fields lists arrays for PG] |
| Flag enforcement on backend routes | API / Backend | — | New `requirePlatformEnabled(platform)` middleware mounted before existing keeta/talabat/deliveroo/americana routers. Returns 404 (not 403) per CON-flag-404-not-403 below. |
| Flag-driven sidebar hiding | Browser | Frontend Server | `Sidebar.tsx` already reads `useAuth().user` — extend `/api/auth/me` to surface `tenant.enabledPlatforms` and filter `PLATFORMS` array client-side. ADMIN bypass = render all four anyway. |
| `/hr/*` workbench shell | Frontend Server (Next.js 14 App Router) | Browser | Standard App Router segment under `frontend/src/app/(dashboard)/hr/`. RBAC at the layout level (OPS_MANAGER+) per `useRole.canManageSettings`. |
| Document expiry detection | API / Backend | BullMQ worker | Reuse existing `aiInsightsEngine.ts:680-720` driver-document scan; add a daily worker (`documentExpiryWorker.ts`) writing Notifications + an agent proposal when expiry <30d. |
| Equipment tracking | Database + API | Browser | `DriverInventory` model already exists [VERIFIED: schema.prisma:602] for HELMET/BIG_BAG/MOBILE_PHONE/SIM_CARD etc — extend with `serialNumber` + `condition` fields, no new model required. |
| Penalty/Restriction timeline | API + Browser | — | Pure aggregation route `GET /api/hr/drivers/:id/timeline` merges `Penalty`, `Violation`, `DriverRestriction`, `Appeal` rows by `createdAt` DESC. Phase 3 Driver File already plans the Violations + Decision-audit sections — Phase 10 adds the timeline composition. |
| Tenant settings UI | Frontend Server | API / Backend | `/settings/tenant` page; backend `PUT /api/admin/tenants/:tenantId/settings` reusing the existing super-admin / OPS_MANAGER+ guard pattern. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | `^5.22.0` (already pinned) | Schema migration for `Tenant.enabledPlatforms`, `Equipment.serialNumber` | The additive-column pattern Phases 1, 2, 5 used. [VERIFIED: backend/package.json] |
| `prisma` | `^5.22.0` | `prisma migrate dev` for new columns + new `Equipment` table extension | Same migration tooling. [VERIFIED] |
| `next` | `14.2.35` | App Router segment `app/(dashboard)/hr/`, layout-level RBAC, `notFound()` for flag-disabled pages | Pinned per CON-stack-frontend. [VERIFIED: frontend/package.json] |
| `zod` | `^3.23.8` | Validate `enabledPlatforms` input + Equipment payloads | All Phase 8 tool inputs use Zod. [VERIFIED: agent/registry.ts] |
| `@tanstack/react-query` | `^5.99.0` | Client cache for workbench tabs + Drivers/Documents/Vehicles lists | Phase 2/4/8 standard. [VERIFIED] |
| `lucide-react` | bundled | Workbench-tab icons (`FileWarning`, `Wrench`, `IdCard`, `Plane`, `ClipboardList`) | Already used in Sidebar.tsx. [VERIFIED] |
| `recharts` | `^3.8.1` | (Optional) document-expiry stacked-bar by month for HR > Documents | Already used in Phase 3 / 8. [VERIFIED] |
| `bullmq` | `^5.73.4` | New `documentExpiryWorker.ts` scheduled job (daily at 06:00 UTC) | Reuses existing queue + scheduler infra. [VERIFIED] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `xlsx` | already vendored | Optional Drivers/Documents export | If HR exports are requested (low priority for Phase 10). [VERIFIED] |
| `date-fns` | already used in frontend | "Expires in 12 days" formatting | Already used by Driver File trend label rendering. [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Tenant.enabledPlatforms String[]` | `Tenant.settings Json` with key `enabledPlatforms` | Json works but `array_contains` requires path + array-not-string [CITED: prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields]. `String[]` PG native array gives clean `hasSome`/`has` filters and is migratable later. |
| Returning **403** on flag-disabled platform routes | Returning **404** | Founder principle: hiding a platform should make it look like it doesn't exist, not like a permission problem. 404 prevents tenants seeing tabs they shouldn't know exist. (See Pitfalls §1.) |
| Building a generic `feature_flags` table | A single `Tenant.enabledPlatforms` column | YAGNI for Phase 10. Roadmap only asks for platform toggles. A generic flag service can come in Q3 if multiple flags appear. [ASSUMED — confirm with founder during /gsd-discuss-phase] |
| Adding a new `Equipment` model | Extending `DriverInventory` with `serialNumber String?` + `condition String?` | `DriverInventory` already has the enum (HELMET / BIG_BAG / MOBILE_PHONE / SIM_CARD / PETROL_CARD) + issuance dates. Adding two nullable columns is a smaller migration than a new model + relations. [VERIFIED: schema.prisma:602] |

**Installation:**

```bash
# Backend (from backend/)
# No new npm dependencies — only a Prisma migration.
cd backend && npx prisma migrate dev --name phase-10-enabledplatforms-equipment
# Frontend: no new dependencies.
```

**Version verification:** All libraries are pinned at versions Phase 8 already validates against npm registry (Phase 8 RESEARCH §Version verification, 2026-05-13). No upgrades required. [VERIFIED: backend/package.json + frontend/package.json read 2026-05-13]

## Architecture Patterns

### System Architecture Diagram

```
                                  USER (any role)
                                       │
                                       ▼
                ┌────────────────────────────────────────────┐
                │  Login → /api/auth/me                       │
                │  Response includes                          │
                │    user.tenant.enabledPlatforms:            │
                │      String[] e.g. ["KEETA","TALABAT"]      │
                │    user.isSuperAdmin: boolean               │
                │    user.role: UserRole                      │
                └────────┬───────────────────────────────────┘
                         │
                         ▼
                ┌────────────────────────────────────────────┐
                │  AuthContext (frontend)                     │
                │  ─► Sidebar.tsx PLATFORMS filtered          │
                │     by enabledPlatforms (ADMIN bypass)      │
                │  ─► Per-page `<PlatformGate />` guard       │
                │  ─► /hr/* always visible (no platform tie)  │
                └────────┬───────────────────────────────────┘
                         │
                         │  user navigates to /talabat/orders
                         │  (enabledPlatforms = ["KEETA"])
                         ▼
                ┌────────────────────────────────────────────┐
                │  app/(dashboard)/talabat/layout.tsx         │
                │  reads enabledPlatforms                     │
                │  calls notFound() if not in array           │
                │     (and user is not ADMIN/super-admin)     │
                └────────┬───────────────────────────────────┘
                         │
                         │ Direct API hit also blocked:
                         ▼
                ┌────────────────────────────────────────────┐
                │  Express server.ts                          │
                │  ─► requirePlatformEnabled("TALABAT")        │
                │     mounted before talabatRoutes            │
                │  ─► 404 if tenant disabled & not ADMIN      │
                └────────┬───────────────────────────────────┘
                         │
                         ▼
                ┌────────────────────────────────────────────┐
                │  HR WORKBENCH (always available)            │
                │  /hr layout (RBAC: OPS_MANAGER+)            │
                │  ├─ /hr             (default → /hr/drivers) │
                │  ├─ /hr/drivers     (workforce list)        │
                │  ├─ /hr/documents   (expiry alerts)         │
                │  ├─ /hr/vehicles    (fleet + assignment)    │
                │  ├─ /hr/equipment   (helmet/bag/SIM)        │
                │  ├─ /hr/penalties   (Penalty + timeline)    │
                │  ├─ /hr/restrictions (DriverRestriction)    │
                │  └─ /hr/leave       (LeaveRequest, staff)   │
                └────────┬───────────────────────────────────┘
                         │
                         ▼  reads from existing routes via
                            @tanstack/react-query
                ┌────────────────────────────────────────────┐
                │  Express /api/* (existing, tenant-scoped)   │
                │  ─► /api/drivers      (946 lines, complete) │
                │  ─► /api/vehicles     (138 lines, thin)     │
                │  ─► /api/penalties    (234 lines, complete) │
                │  ─► /api/driver-restrictions (190 lines)    │
                │  ─► /api/leave-requests                     │
                │  ─► /api/hr/timeline/:driverId    NEW       │
                │  ─► /api/hr/documents/expiring    NEW       │
                │  ─► /api/hr/equipment             NEW       │
                │  ─► /api/admin/tenants/:id        NEW       │
                └────────────────────────────────────────────┘
```

### Recommended Project Structure

```
backend/src/
├── routes/
│   ├── hr/                    # NEW — workbench aggregate routes
│   │   ├── index.ts           # mounts the four sub-routers
│   │   ├── documents.ts       # GET /expiring, GET /:driverId
│   │   ├── equipment.ts       # CRUD on DriverInventory + serial
│   │   ├── timeline.ts        # GET /:driverId/timeline merge
│   │   └── staff.ts           # office-staff (User) CRUD facade
│   ├── admin/
│   │   └── tenants.ts         # NEW — PUT enabledPlatforms (super-admin)
│   ├── keeta.ts               # existing — wrap with requirePlatformEnabled
│   ├── talabat.ts             # same
│   ├── deliveroo.ts           # same
│   └── americana.ts           # same
├── middleware/
│   └── requirePlatformEnabled.ts  # NEW — 404 when platform disabled
└── queues/
    └── documentExpiryWorker.ts    # NEW — daily scan, write Notifications

frontend/src/
├── app/(dashboard)/
│   ├── hr/                       # NEW route group
│   │   ├── layout.tsx            # RBAC + tabs shell
│   │   ├── page.tsx              # redirect → /hr/drivers
│   │   ├── drivers/page.tsx
│   │   ├── documents/page.tsx    # expiry-alerts list, color-coded
│   │   ├── vehicles/page.tsx     # fleet + assignment
│   │   ├── equipment/page.tsx    # helmet/bag/SIM tracker
│   │   ├── penalties/page.tsx
│   │   ├── restrictions/page.tsx
│   │   └── leave/page.tsx
│   ├── settings/
│   │   └── tenant/page.tsx       # NEW — ADMIN toggles enabledPlatforms
│   ├── keeta/layout.tsx          # NEW — flag gate using notFound()
│   ├── talabat/layout.tsx        # same
│   ├── deliveroo/layout.tsx      # same
│   └── americana/layout.tsx      # same
├── components/
│   └── hr/                       # NEW
│       ├── HrWorkbenchShell.tsx
│       ├── DocumentExpiryCard.tsx
│       ├── EquipmentRow.tsx
│       ├── TimelineEntry.tsx
│       └── PlatformGate.tsx      # client-side guard
└── hooks/
    └── useEnabledPlatforms.ts    # reads from AuthContext, ADMIN bypass
```

### Pattern 1: `Tenant.enabledPlatforms` as Postgres native array

**What:** Add a `String[]` column (Postgres ARRAY) typed via a Zod schema accepting only `"KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA"` strings. Default `["KEETA","TALABAT","DELIVEROO","AMERICANA"]` for all existing tenants (no-op on backward compatibility).

**When to use:** Whenever a tenant-level capability needs a many-of-fixed-set switch. Future flags (e.g. enabled features) should follow the same pattern — one column per concern, not a generic JSON bag, until a flag service is justified.

**Example:**
```prisma
// schema.prisma — additive change to existing model Tenant
model Tenant {
  // ... existing fields ...
  // Phase 10 — tenant-level platform flag. Default = all four platforms
  // visible so existing tenants are not affected by the migration.
  enabledPlatforms String[] @default(["KEETA","TALABAT","DELIVEROO","AMERICANA"])
  // ...
}
```

```ts
// backend/src/middleware/requirePlatformEnabled.ts
// Source: pattern derived from existing middleware/superAdmin.ts which
// reads the DB on every request to avoid stale-JWT attacks.
import { Request, Response, NextFunction } from "express";
import { prisma } from "../config";

export function requirePlatformEnabled(platform: "KEETA"|"TALABAT"|"DELIVEROO"|"AMERICANA") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.tenantId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    // ADMIN role + isSuperAdmin always sees everything (Pitfall §3 — admins
    // must not lock themselves out).
    if (req.user.role === "ADMIN") { next(); return; }
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { enabledPlatforms: true },
    });
    if (!tenant?.enabledPlatforms?.includes(platform)) {
      // 404 not 403 — see Pitfalls §1 + CON-flag-404-not-403.
      res.status(404).end();
      return;
    }
    next();
  };
}
```

```ts
// backend/src/server.ts — wrap existing platform routers
app.use("/api/keeta", requirePlatformEnabled("KEETA"), keetaRoutes);
app.use("/api/talabat", requirePlatformEnabled("TALABAT"), talabatRoutes);
app.use("/api/deliveroo", requirePlatformEnabled("DELIVEROO"), deliverooRoutes);
app.use("/api/americana", requirePlatformEnabled("AMERICANA"), americanaRoutes);
// Same for sibling routers: /api/keeta/monitor, /api/talabat/available-shifts, etc.
```

### Pattern 2: Frontend conditional sidebar + `notFound()` per-platform layout

**What:** Two-layer defense. Sidebar hides tabs (the obvious UX); platform layouts call `notFound()` if a user navigates directly via URL.

**When to use:** Always together. Sidebar-only hiding is bypassable by URL; layout-only gating leaves dead links in the sidebar.

**Example:**
```tsx
// frontend/src/app/(dashboard)/talabat/layout.tsx — NEW
"use client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { notFound } from "next/navigation";

export default function TalabatLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  if (!user) return null;  // pre-auth render; (dashboard)/layout already redirects
  const enabled = (user as any).tenant?.enabledPlatforms ?? ["TALABAT"]; // safe default
  if (!isAdmin && !enabled.includes("TALABAT")) notFound();
  return <>{children}</>;
}
```

```tsx
// frontend/src/components/layout/Sidebar.tsx — extend PLATFORMS filter
const enabled = (user as any)?.tenant?.enabledPlatforms ?? ["KEETA","TALABAT","DELIVEROO","AMERICANA"];
const visiblePlatforms = isAdmin
  ? PLATFORMS                                              // ADMIN bypass
  : PLATFORMS.filter((p) => enabled.includes(p.name.toUpperCase()));
```

`notFound()` throws `NEXT_HTTP_ERROR_FALLBACK;404` and renders the route's `not-found.tsx` segment file [CITED: nextjs.org/docs/app/api-reference/functions/not-found]. Layout-level invocation prevents page render before data fetch.

### Pattern 3: HR workbench shell (mirrors Phase 8 `/finance/*` pattern)

**What:** Single Next.js segment `(dashboard)/hr/` with `layout.tsx` rendering a left-rail tab list. Each tab is its own page consuming an existing API route.

**When to use:** Whenever consolidating multiple related concerns into one role's workspace. Pattern proven in Phase 8 (accountant workbench). Phase 10 reuses it for HR/people ops.

**Example:**
```tsx
// frontend/src/app/(dashboard)/hr/layout.tsx — NEW
"use client";
import { useRole } from "@/hooks/useRole";
import { notFound } from "next/navigation";
import HrWorkbenchShell from "@/components/hr/HrWorkbenchShell";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const { canManageSettings } = useRole();   // OPS_MANAGER+
  if (!canManageSettings) notFound();
  return <HrWorkbenchShell>{children}</HrWorkbenchShell>;
}
```

### Pattern 4: Penalty/Restriction timeline aggregation

**What:** Single backend endpoint merging Penalty, Violation, DriverRestriction, Appeal rows for one driver, ordered by `createdAt` DESC.

**When to use:** Any per-driver chronological history view. Already partial in Phase 3 Driver File (`GET /api/drivers/:id/file` covers Violations + Decision audit log). Phase 10 adds DriverRestriction + Appeal to the merge.

**Example:**
```ts
// backend/src/routes/hr/timeline.ts — NEW
router.get("/:driverId/timeline", async (req, res) => {
  const tenantId = req.user!.tenantId;
  const { driverId } = req.params;
  const [penalties, violations, restrictions, appeals] = await Promise.all([
    prisma.penalty.findMany({ where: { tenantId, driverId } }),
    prisma.violation.findMany({ where: { tenantId, driverId } }),
    prisma.driverRestriction.findMany({ where: { tenantId, driverId } }),
    prisma.appeal.findMany({ where: { tenantId, violation: { driverId } } }),
  ]);
  const events = [
    ...penalties.map(p => ({ kind: "PENALTY" as const, at: p.createdAt, data: p })),
    ...violations.map(v => ({ kind: "VIOLATION" as const, at: v.violationTime, data: v })),
    ...restrictions.map(r => ({ kind: "RESTRICTION" as const, at: r.startDate, data: r })),
    ...appeals.map(a => ({ kind: "APPEAL" as const, at: a.appealedAt, data: a })),
  ].sort((a,b) => b.at.getTime() - a.at.getTime());
  res.json({ driverId, events });
});
```

### Anti-Patterns to Avoid

- **403 instead of 404 for flag-disabled platforms** — leaks the existence of disabled features to tenants who shouldn't know about them. Always return 404 [Pitfall §1].
- **Reading the flag from the JWT** — JWTs are issued at login and can be stale. The flag must come from the DB on every request (mirrors `requireSuperAdmin` pattern at `middleware/superAdmin.ts:15-23`).
- **Building a generic `feature_flags` JSON column on Tenant** — flag-soup quickly. Each new flag should be its own typed column until cross-flag composition is needed.
- **Inferring "is this an office staff or a courier?" by role** — there is no `isCourier` field on Driver, and `User` is the office-staff model already (per DEC-driver-vs-employee-split). `/hr/leave` operates on `User` rows, `/hr/drivers` on `Driver` rows. Don't merge them.
- **Letting a non-ADMIN OPS_MANAGER toggle `enabledPlatforms`** — only ADMIN + super-admin can change tenant-level flags. OPS_MANAGER can only view (Pitfall §3 lockout risk).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-tenant feature flag service | Custom flag service / launchdarkly-style table | One typed column per concern on `Tenant` | YAGNI; one flag in Phase 10. A generic service is justifiable only if 5+ flags appear. |
| Document expiry status field | Recompute on read across every endpoint | The 7 existing `*Status` columns on `Driver` (already shipped) + a daily worker that updates them and writes a Notification | Pre-computation already exists — `Driver.civilIdStatus` etc. are set by ingest. A worker is cheaper than every-read recomputation. [VERIFIED: backend/prisma/schema.prisma:515-528] |
| Equipment serial-number validation | Hand-roll regex per device type | `zod.string().regex(/.../)` per type, configurable per tenant via `Tenant.settings.equipmentSerialRules` Json | Tenants will demand custom serial formats; a generic regex map handles 100% with no code change. [ASSUMED — confirm with founder during planning] |
| Timeline aggregation | A new `HrEvent` materialised table | The pattern in Pattern 4 — Promise.all 4 queries, merge in memory, sort | <1000 events per driver in 99% of tenants; in-memory sort is faster than the index design for a new table. |
| Sidebar flag-state cache | A new React Context just for flags | Re-use existing `AuthContext.user.tenant.enabledPlatforms` | The /me payload already cascades on login/refresh — adding a context creates two sources of truth. |

**Key insight:** Phase 10 is mostly **consolidation**, not new construction. The data primitives are all shipped. The work is shells, gates, and a daily worker.

## Runtime State Inventory

**Skipped — Phase 10 is additive (new column, new routes, new pages). No renames, refactors, migrations, or string replacements that would leave runtime state behind.** The single existing-data migration is the `Tenant.enabledPlatforms` default-value backfill, which Prisma handles automatically via the column default.

## Common Pitfalls

### Pitfall 1: Returning 403 instead of 404 for flag-disabled platforms

**What goes wrong:** A tenant on KEETA-only navigates to `/talabat/orders` and sees a "permission denied" page — now they know Talabat is a feature, ask sales why they can't have it, and find out their plan was downgraded.

**Why it happens:** Default Express + Next.js patterns prefer 403 for authz failures. But this isn't authz — it's a *capability* that doesn't exist for this tenant.

**How to avoid:** Always 404. Both the backend middleware (`requirePlatformEnabled`) and the frontend layout (`notFound()`) emit 404 for disabled platforms. Reserve 403 for actual role-permission failures (e.g. VIEWER trying to delete).

**Warning signs:** Anyone proposing "show a friendly message explaining their plan doesn't include Talabat" — that's a sales motion, not a UI feature. Belongs in the upgrade-path flow, not the platform-tab flow.

### Pitfall 2: Civil ID / license expiry is calendar-date math, not real-time

**What goes wrong:** A driver's civil ID expires at midnight 2026-06-01 Kuwait time. The agent posts a Notification at 23:59 UTC 2026-05-31 (= 02:59 Kuwait 2026-06-01) — three hours after the actual expiry — because the worker ran on UTC.

**Why it happens:** Kuwait is UTC+3. PostgreSQL DateTime stores UTC. "Expires today" in Kuwait calendar is *not* "expires today" in UTC.

**How to avoid:** Run the daily document-expiry worker with `dateFnsTz.zonedTimeToUtc(startOfDay(now, "Asia/Kuwait"), "Asia/Kuwait")` as the cutoff. The existing `aiInsightsEngine.ts:680` query uses naive `now` — that's a latent bug for Phase 10 to fix in the new `documentExpiryWorker.ts`.

**Warning signs:** Anyone proposing "just check if expiry < new Date()" — that's UTC midnight, not Kuwait midnight.

### Pitfall 3: Admin lock-out — disabling all platforms hides everything

**What goes wrong:** An ADMIN toggles `enabledPlatforms = []` in settings. Sidebar hides all four platforms. ADMIN can no longer re-enable because `/settings/tenant` itself happens to be inside a flag-checked route group (or the navigation to it goes through `/keeta/*`). Lockout.

**Why it happens:** Flag enforcement is enforced uniformly across all `(dashboard)/*` routes; nothing in the design says "ADMIN can see everything regardless."

**How to avoid:** Two layers. (a) Backend middleware `requirePlatformEnabled` checks `req.user.role === "ADMIN"` and short-circuits to `next()`. (b) Frontend `Sidebar.tsx` filter checks `isAdmin` and renders all platforms regardless. **Test this on day 1** of Wave 1 with a Jest test that asserts: "admin with enabledPlatforms=[] still sees all four sidebar entries."

**Warning signs:** Anyone proposing to gate `/settings/tenant` itself by platform flag. That route must be flag-immune.

### Pitfall 4: Equipment serial-number uniqueness scope ambiguity

**What goes wrong:** Tenant A registers SIM serial `8966...123`. Tenant B (different fleet) registers the same SIM — physically impossible, but our schema lets it. Or the inverse: a SIM is reassigned from Driver D1 to D2 in the same tenant, and we accidentally enforce serial uniqueness across all time so reassignment fails.

**Why it happens:** "Unique within a tenant" vs "unique globally" vs "unique among currently-issued" are three different invariants. The existing `DriverInventory` model has no uniqueness at all (only `driverId` index).

**How to avoid:** Decide and document the invariant during /gsd-discuss-phase. Recommendation: `@@unique([tenantId, itemType, serialNumber])` *partial-index*-style (only when `serialNumber IS NOT NULL`). Reassignment writes a new row + sets `returnedDate` on the old. [ASSUMED — confirm with founder during planning]

**Warning signs:** Anyone proposing a global `@unique` on serial number — wrong scope.

### Pitfall 5: Document-expiry notification spam

**What goes wrong:** Civil ID expires 30 days from today. Worker runs daily. By day 25, the operator has received 5 identical notifications about the same driver's civil ID. Operator turns off notifications.

**Why it happens:** Naive "if expiring soon, write Notification" runs every day.

**How to avoid:** Write the Notification once per `(driverId, documentType)` per status transition (`VALID → EXPIRING`, `EXPIRING → EXPIRED`). Use the `Notification.sourceId = "${driverId}:civilId:expiring"` idempotency pattern — Notification model has `idempotencyKey` already on `NotificationDelivery` [VERIFIED: schema.prisma:1696]. Notification itself has `sourceId` for grouping.

**Warning signs:** Worker code that uses `prisma.notification.create` without an upsert / sourceId check.

### Pitfall 6: Existing per-platform pages assume the platform is always on

**What goes wrong:** A user with `enabledPlatforms=["KEETA"]` clicks a chat-generated link to `/talabat/drivers/abc123` from an old saved view. The 404 lands them on a generic 404 page, with no path back to the workbench.

**Why it happens:** `notFound()` renders the closest `not-found.tsx` segment. If we don't ship one for `(dashboard)/talabat/`, the global 404 fires.

**How to avoid:** Ship `app/(dashboard)/keeta/not-found.tsx`, same for talabat/deliveroo/americana, that says "This platform isn't enabled for your fleet" + Back-to-Dashboard link. (Per Pitfall §1, the page must NOT mention upgrade / plan.)

**Warning signs:** Verification step missing a "navigate to disabled platform URL → see proper 404 segment" check.

## Per-Platform Polish

Routes audited 2026-05-13. Line counts indicate maturity; gaps are concrete missing endpoints.

| Platform | Route file | Current LoC | CRUD gaps | Filter/Export gaps |
|----------|-----------|--------------|-----------|---------------------|
| Keeta    | `keeta.ts` (486) | Missing PUT/DELETE on `/metrics/:id` partial — only PUT exists. Driver-summary read-only (intentional). | `/metrics` GET lacks `companyId` filter; no XLSX export endpoint (only `POST /import`). Reports are out-of-scope (in `keetaReports.ts`). |
| Talabat  | `talabat.ts` (1289) | Most mature. Compliance + sessions + deliveroo all have full CRUD. | Sessions list lacks deep filter on `zone`. Deliveries lacks `from`/`to` range explicit param (uses `dateFrom`/`dateTo` — inconsistent with Keeta). [Recommend: normalise to `dateFrom`/`dateTo` everywhere in Phase 10] |
| Deliveroo | `deliveroo.ts` (511) | No driver-detail endpoint — frontend has `deliveroo/drivers` list but driver detail goes through Phase 3 `/drivers/:id` (correct). Cash CRUD limited to GET. | No DELETE on metrics. Export endpoints exist (orders, cash). |
| Americana | `americana.ts` (470) | Settings PUT exists at L431 but no schema validation visible in skim. No DELETE on orders. | `/branch-performance` and `/performance` are GET-only (correct — they're aggregations). |

**Phase 10 per-platform polish scope (deliberate, time-boxed):**

1. Normalise filter parameter names across all four routes (`dateFrom`/`dateTo`, `companyId`, `platform`, `status`, `search`). [LOW risk]
2. Add Zod schema validation to Americana settings PUT (L431). [LOW risk, HIGH value]
3. Add `GET /api/keeta/metrics/export` mirroring `GET /api/deliveroo/cash/export` (L441). [MEDIUM]
4. Mount all four routers behind `requirePlatformEnabled`. [HIGH priority]
5. Add `app/(dashboard)/{platform}/layout.tsx` + `not-found.tsx` for each. [HIGH priority]

**Out of scope:** Renaming routes, restructuring `keeta.ts` sub-routers (already mounted at `/api/keeta/monitor` etc.), or any platform-specific feature work — those are roadmap-future items.

## HR Workbench Surface

Single segment `frontend/src/app/(dashboard)/hr/` with these tabs:

| Tab | Source data | Existing route | New route | Notes |
|-----|-------------|----------------|-----------|-------|
| Drivers | `Driver` model | `GET /api/drivers` (946 lines, complete) | — | List + click → Phase 3 Driver File. Filter by status / platform. |
| Documents | `Driver.*Expiry/*Status` cols (already shipped) | — | `GET /api/hr/documents/expiring?within=30d` | Color-coded by status (VALID green / EXPIRING amber / EXPIRED red / MISSING grey). Click → Driver File. |
| Vehicles | `Vehicle` model | `GET /api/vehicles` (138 lines) | `PUT /api/vehicles/:id/assign` (NEW) | Vehicles list + assignment to driver. Existing route is thin; add assignment endpoint. |
| Equipment | `DriverInventory` model | — | `GET/POST/PUT /api/hr/equipment` | Helmet/Big-Bag/Mobile/SIM/PetrolCard with `serialNumber` + `condition` (new cols, see Schema §). |
| Penalties | `Penalty` model | `GET /api/penalties` (234 lines, complete) | — | Existing list. Click row → Driver File + scrolls to Decision-audit section. |
| Restrictions | `DriverRestriction` model | `GET /api/driver-restrictions` (190 lines) | — | Existing list. Surface alongside Penalties. |
| Leave | `LeaveRequest` model | `GET /api/leave-requests` (163 lines) | — | Office staff (User) leave. Per REQ-hr-employees + REQ-hr-leave, this is office-staff only — drivers don't take leave through this surface (their schedule is in /shifts). |
| Timeline | merged | — | `GET /api/hr/drivers/:driverId/timeline` | Composite view: Penalty + Violation + Restriction + Appeal per driver, sorted. Linked from Driver File. |

The workbench is the **default landing for OPS_MANAGER role** if Phase 10 elects to extend role-based landing (Phase 2 set `/decisions` for OWNER; Phase 8 sets `/finance/cash` for ACCOUNTANT). [ASSUMED — confirm with founder; current default for OPS_MANAGER is `/v2`/`/overview`]

## Tenant Settings UI

| Element | Path | RBAC | Purpose |
|---------|------|------|---------|
| Page | `frontend/src/app/(dashboard)/settings/tenant/page.tsx` | ADMIN only (UI hides for others; backend enforces) | Toggle enabledPlatforms, set HR field visibility (later), cost ceilings (later) |
| API | `PUT /api/admin/tenants/:tenantId/settings` | super-admin or ADMIN | Update enabledPlatforms; audit-logged via existing AuditLog |
| Lockout safety | Frontend: confirm modal "Disabling all platforms hides them from non-admin users. ADMIN users (you) will still see them." Backend: refuse to set `enabledPlatforms = []` AND `req.user.role !== "ADMIN"` simultaneously. |

The existing `frontend/src/app/(dashboard)/settings/page.tsx` (L1-30 read) already has tabs (`companies | users | notifications | profile`). Adding a `tenant` tab is the cheapest path. Alternative: separate `/settings/tenant/` page — recommended for clarity since toggles are ADMIN-only and shouldn't pollute the OPS_MANAGER-visible tabs.

## Schema Additions (Wave 1)

Three additive changes. No backfill scripts required — all have safe defaults.

```prisma
// 1. Tenant model — additive column
model Tenant {
  // ... existing fields ...
  enabledPlatforms String[] @default(["KEETA","TALABAT","DELIVEROO","AMERICANA"])
  // ... existing fields ...
}

// 2. DriverInventory — extend for equipment tracking
model DriverInventory {
  // ... existing fields (driverId, itemType, issued, quantity, issuedDate, returnedDate) ...
  serialNumber String?      // Phase 10 — required for MOBILE_PHONE, SIM_CARD, PETROL_CARD; optional for HELMET/BAG.
  condition    String?      // "NEW" | "GOOD" | "WORN" | "DAMAGED"
  notes        String?      // free-text issuance note

  @@unique([driverId, itemType, serialNumber])  // partial-unique semantics via Postgres NULL = distinct
  @@index([itemType, serialNumber])              // for lookups by serial
}

// 3. (Optional) Notification idempotency for document expiry
// No model change — uses existing Notification.sourceId pattern with the
// idempotency convention "doc-expiry:{driverId}:{docType}:{transitionDate}".
```

The `@@unique([driverId, itemType, serialNumber])` works because PG treats `NULL` values as distinct in unique indexes — multiple HELMET rows with `serialNumber=NULL` co-exist. [VERIFIED: prisma.io/docs/orm/reference/prisma-schema-reference#unique-1 + PG docs]

## Document Expiry Workflow

Existing state: `Driver.civilIdExpiry` + `Driver.civilIdStatus` columns shipped [VERIFIED: schema.prisma:527-528]. `aiInsightsEngine.ts:680-720` already runs a query for drivers with documents expiring in the next 30 days [VERIFIED]. Notifications model has `category` field ("IMPORTANT" / "OPS_TODO" / "BENEFITS" / "OTHER") and `titleAr`/`bodyAr` for bilingual [VERIFIED: schema.prisma:1671-1673].

**Phase 10 adds:**

1. `backend/src/queues/documentExpiryWorker.ts` — daily BullMQ job at 06:00 Asia/Kuwait. Scans all `Driver` rows per tenant; for each document field, if expiry is between today and today+30d AND current status differs from previously-recorded status, write:
   - One `Notification` (category="IMPORTANT", titleAr + bodyAr bilingual, sourceId for idempotency).
   - One **agent proposal** via Phase 8 propose-and-confirm — i.e., a row in `PendingAgentAction` with `toolName = "draftCourierMessage"` proposing to remind the driver bilingually. This is per the roadmap directive "agent proposal to create a Notification when document expires <30d."
2. New endpoint `GET /api/hr/documents/expiring?within=30d` returning all drivers with at least one document expiring in the window, grouped by document type.
3. New `<DocumentExpiryCard />` component rendering colour-coded status pills.

**Bilingual note:** Per REQ-bilingual-courier-comms, every courier-facing draft is bilingual. The agent proposal MUST set both `body` (English) and `bodyAr` (Arabic). Phase 9 ships the actual outbound bilingual surface; Phase 10's worker just produces the drafts.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js `middleware.ts` | `proxy.ts` (renamed `middleware → proxy`) | Next.js 16.0.0 | We are on 14.2.35 [VERIFIED] — keep using `middleware.ts`. [CITED: nextjs.org/docs/app/api-reference/file-conventions/middleware version history] |
| Json column for flags | Postgres native `String[]` arrays | Prisma 2.x+ (already mature) | Use native array; `hasSome`/`has` is the standard filter (vs `array_contains` for JSON which requires the `path` argument and array-not-string PostgreSQL syntax) [CITED: prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields] |
| Hand-rolled BullMQ delayed jobs | BullMQ `JobScheduler` repeatable jobs | BullMQ 5.x | Already used by `scheduledBriefingsWorker.ts` (Phase 4) — same pattern for documentExpiryWorker. [VERIFIED] |

**Deprecated/outdated:**
- Next.js Pages Router for new code: deprecated — App Router only (we already use App Router throughout).
- `prisma.tenant.findUnique({ where: { id }})` without `select: { enabledPlatforms: true }` on the flag-check path: not deprecated, but a hot-path read; always `select` only the flag column.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Tenant.enabledPlatforms` default should be all four platforms enabled | Schema Additions, Pattern 1 | Low — preserves existing-tenant behaviour; an empty default would hide all platforms from every existing tenant on migration day. |
| A2 | Equipment serial-number uniqueness is `@@unique([driverId, itemType, serialNumber])` | Pitfalls §4, Schema Additions | Medium — wrong scope (global vs tenant-scoped vs reassignment-aware) could either block reassignment or allow cross-tenant collisions. Confirm in /gsd-discuss-phase. |
| A3 | OPS_MANAGER default landing should become `/hr` | HR Workbench Surface | Low — Phase 8 establishes role-based landing pattern (ACCOUNTANT → /finance/cash), Phase 10 extends it. If founder prefers `/decisions` for OPS_MANAGER too, this is a one-line change. |
| A4 | Tenant-level flag column suffices; a generic feature_flags service is YAGNI | Standard Stack §Alternatives, Don't Hand-Roll | Low — easy to refactor later. Only painful if 5+ flags appear quickly. |
| A5 | 404 not 403 for flag-disabled platforms | Pitfalls §1, Pattern 1 | Low — Founder principle ("propose-and-confirm, never leak what they don't have") supports 404. Worth re-confirming in /gsd-discuss-phase. |
| A6 | Document-expiry worker emits one Notification per status transition (not daily) | Pitfalls §5 | Medium — daily spam is the failure mode; confirm idempotency strategy. |
| A7 | `papaparse` not needed for HR exports (xlsx suffices) | Standard Stack | Low — only matters if CSV streaming is explicitly required. |

## Open Questions

1. **Should the agent propose actions on document expiry (Notification only, or also a pending agent action)?**
   - What we know: roadmap says "create a Notification when document expires <30d." Phase 8 establishes the propose-and-confirm pattern for agent actions.
   - What's unclear: do we also raise a `PendingAgentAction` so the owner sees a Decisions card, or is the Notification + HR-tab alert sufficient?
   - Recommendation: ship Notification first (W3), defer the Decisions card to a future phase unless founder asks for it during planning.

2. **OPS_MANAGER role landing page — `/hr` or `/decisions`?**
   - What we know: Phase 2 = OWNER → /decisions; Phase 8 = ACCOUNTANT → /finance/cash; dispatcher (Phase 7) → /floor.
   - What's unclear: OPS_MANAGER doesn't have a primary surface assigned.
   - Recommendation: default to `/hr` (HR workbench) on the grounds that OPS_MANAGER's daily concern is workforce. Confirm in /gsd-discuss-phase.

3. **Are office staff (User rows) eligible for the equipment tracker?**
   - What we know: `DriverInventory` is keyed by `driverId`. Office staff are `User` rows.
   - What's unclear: do supervisors need to track their own laptop / phone in HR?
   - Recommendation: scope Equipment to drivers only in Phase 10. Office-staff asset tracking is a future addition.

4. **Should the timeline tab show GPS-stale and Cash-overdue events?**
   - What we know: those are anomaly types from the Phase 2 monitor agent.
   - What's unclear: are they "incidents" worth showing on the per-driver timeline?
   - Recommendation: Phase 10 timeline shows Penalty + Violation + Restriction + Appeal only (the disciplinary record). Anomalies live in Decisions / Driver File "Decision audit log" section.

5. **Per-platform polish scope — do we touch Talabat's 1289-line route?**
   - What we know: Talabat is the most-developed route file; polish risk is touching working code.
   - Recommendation: do NOT refactor Talabat in Phase 10. Only normalise parameter names (`dateFrom`/`dateTo`) at the API surface level via a thin wrapper if needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL with native ARRAY support | `Tenant.enabledPlatforms String[]` | ✓ (the project runs PG 15) | 15.x | — |
| Prisma migration tooling | Schema additions | ✓ | 5.22.0 | — |
| BullMQ worker scheduler | `documentExpiryWorker.ts` | ✓ | 5.73.4 | — |
| Redis 7 | BullMQ backing store | ✓ | 7.x | — |
| date-fns + date-fns-tz | Asia/Kuwait timezone math | ✓ frontend; backend has `date-fns` | already pinned | — |

**No missing dependencies.** This phase is pure schema + code; nothing new to install.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x (backend, frontend) — already configured |
| Config file | `backend/jest.config.js`, `frontend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern=phase-10 --bail` |
| Full suite command | `cd backend && npm test && cd ../frontend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-operations-per-platform-sections | Per-platform Drivers/Orders/Violations sub-pages | smoke | `pytest tests/test_phase10_perplatform.py -x` (Jest equivalent) | ❌ Wave 0 |
| REQ-hr-employees | Office staff CRUD (User) renders under /hr | unit | `cd backend && npx jest hr.staff` | ❌ Wave 0 |
| REQ-hr-leave | LeaveRequest CRUD surfaces under /hr/leave | unit | `cd backend && npx jest leaveRequests` | partial (`leave-requests.ts` exists) |
| REQ-hr-documents | Document expiry alerts surface; bilingual Notification on transition | integration | `cd backend && npx jest documentExpiry` | ❌ Wave 0 |
| (new — flag) Tenant.enabledPlatforms gating | 404 on disabled platform; ADMIN bypass; UI hides tabs | integration | `cd backend && npx jest requirePlatformEnabled` + `cd frontend && npx jest Sidebar.enabledPlatforms` | ❌ Wave 0 |
| (new — flag) Lockout safety | ADMIN with enabledPlatforms=[] still sees /settings/tenant | integration | `cd frontend && npx jest TenantSettingsAdminBypass` | ❌ Wave 0 |
| (new — equipment) DriverInventory serial uniqueness | Reassignment writes new row; cross-tenant collision allowed | unit | `cd backend && npx jest equipment.uniqueness` | ❌ Wave 0 |
| (new — timeline) Aggregated HR timeline | Penalty + Violation + Restriction + Appeal merged + sorted | unit | `cd backend && npx jest hr.timeline` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --bail --testPathPattern=phase-10` (~10s)
- **Per wave merge:** Full backend suite + frontend `--testPathPattern="(Sidebar|hr|tenant)"`
- **Phase gate:** Full backend + frontend test suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/middleware/requirePlatformEnabled.test.ts` — covers flag, ADMIN bypass, super-admin bypass, 404 on disabled
- [ ] `backend/src/__tests__/routes/hr/timeline.test.ts` — covers aggregation correctness
- [ ] `backend/src/__tests__/queues/documentExpiryWorker.test.ts` — covers timezone math + idempotency
- [ ] `backend/src/__tests__/routes/hr/equipment.test.ts` — covers serial-number uniqueness scope
- [ ] `frontend/src/__tests__/components/layout/Sidebar.enabledPlatforms.test.tsx` — covers conditional rendering + ADMIN bypass
- [ ] `frontend/src/__tests__/app/talabat/layout.test.tsx` — covers `notFound()` invocation for disabled tenants
- [ ] `frontend/src/__tests__/app/settings/tenant/page.test.tsx` — covers lockout-safety confirm modal
- [ ] Gold-set fixture: `tenants/keeta-only.json` (`enabledPlatforms: ["KEETA"]`)
- [ ] Gold-set fixture: `tenants/empty-platforms.json` (`enabledPlatforms: []`, ADMIN user attached)
- [ ] Lint:tenant scope extension: add `backend/src/routes/hr/`, `backend/src/middleware/requirePlatformEnabled.ts`, `backend/src/queues/documentExpiryWorker.ts` to the lint:tenant glob

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuses existing JWT (15-min access + 7-day refresh) — no new auth surface. |
| V3 Session Management | no | No session changes. |
| V4 Access Control | yes | New middleware `requirePlatformEnabled` + ADMIN bypass — explicit role check. `/api/admin/tenants/*` ALREADY behind `requireSuperAdmin` [VERIFIED: backend/src/middleware/superAdmin.ts]. |
| V5 Input Validation | yes | `zod` schema for `enabledPlatforms` (must be `("KEETA"|"TALABAT"|"DELIVEROO"|"AMERICANA")[]`) and Equipment serial number. |
| V6 Cryptography | no | No new crypto; secrets unchanged. |
| V8 Data Protection | yes | Tenant-scope guarantee preserved — `requirePlatformEnabled` runs AFTER `tenantScope` so `req.user.tenantId` is set. |

### Known Threat Patterns for {Express + Next.js + Prisma}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale JWT carries old `enabledPlatforms` after admin disables a platform | Tampering / Spoofing | Read flag from DB on every request, not from JWT (mirrors superAdmin pattern) |
| Tenant-leak via flag enumeration | Information Disclosure | 404 not 403 (Pitfall §1); no error body mentioning the platform name |
| Admin lockout via `enabledPlatforms=[]` | Denial of Service (self) | ADMIN role bypass at both middleware and Sidebar layers (Pitfall §3) |
| Equipment serial collision across tenants used to track a device | Spoofing | `@@unique([driverId, itemType, serialNumber])` scoped to driver+tenant via FK (Pitfall §4) |
| SQL injection in dynamic `where` builders on new HR routes | Tampering | All new routes use Prisma client (parameterized) and Zod input validation — never `prisma.$queryRawUnsafe` |
| Cross-tenant Driver / Vehicle / Penalty access via path parameter | Authorization bypass | `tenantScope` middleware already applied on all platform/hr routes; `lint:tenant` ESLint custom rule catches missing `tenantId` filters [VERIFIED: backend/package.json lint:tenant] |

## Code Examples

### Common Operation 1: enabledPlatforms in /api/auth/me

```ts
// backend/src/services/authService.ts — EXTEND existing getMe()
// Source: backend/src/routes/auth.ts L224
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, tenantId: true,
      isSuperAdmin: true,
      tenant: {
        select: {
          id: true, name: true,
          enabledPlatforms: true,   // Phase 10 — surface flag to frontend
        },
      },
    },
  });
  if (!user) throw new Error("User not found");
  return user;
}
```

### Common Operation 2: Document-expiry worker (sketch)

```ts
// backend/src/queues/documentExpiryWorker.ts — NEW
import { Worker } from "bullmq";
import { prisma } from "../config";
import { startOfDay, addDays } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";

const KUWAIT_TZ = "Asia/Kuwait";

// Repeatable daily job via JobScheduler (Phase 4 pattern).
export const documentExpiryWorker = new Worker("documentExpiry", async (job) => {
  const todayKuwait = zonedTimeToUtc(startOfDay(new Date()), KUWAIT_TZ);
  const cutoff30d = addDays(todayKuwait, 30);

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    const drivers = await prisma.driver.findMany({
      where: {
        tenantId: t.id,
        OR: [
          { civilIdExpiry:           { gte: todayKuwait, lte: cutoff30d } },
          { drivingLicenseExpiry:    { gte: todayKuwait, lte: cutoff30d } },
          { vehicleInsuranceExpiry:  { gte: todayKuwait, lte: cutoff30d } },
          // ... other doc fields ...
        ],
      },
      select: {
        id: true, name: true, civilIdExpiry: true, civilIdStatus: true,
        drivingLicenseExpiry: true, drivingLicenseStatus: true,
        // ...
      },
    });
    for (const d of drivers) {
      for (const docType of DOC_TYPES) {
        const expiryField = `${docType}Expiry` as const;
        const statusField = `${docType}Status` as const;
        const expiry = d[expiryField];
        if (!expiry) continue;
        const newStatus = expiry < todayKuwait ? "EXPIRED" :
                          expiry <= addDays(todayKuwait, 7) ? "EXPIRING_SOON" :
                          "EXPIRING";
        if (d[statusField] === newStatus) continue;   // idempotency: only on transition
        await prisma.notification.upsert({
          where: { /* by sourceId */ },
          create: {
            tenantId: t.id,
            type: "DOCUMENT_EXPIRY",
            severity: newStatus === "EXPIRED" ? "CRITICAL" : "HIGH",
            category: "IMPORTANT",
            title:   `${d.name}: ${docType} ${newStatus}`,
            titleAr: `${d.name}: ${docType} ${newStatus}`, // [TODO bilingual via existing notification i18n]
            message: `${docType} expires ${expiry.toISOString().slice(0,10)}.`,
            bodyAr:  /* Arabic body */,
            sourceId: `doc-expiry:${d.id}:${docType}`,
          },
          update: { severity: ..., title: ... },
        });
        await prisma.driver.update({
          where: { id: d.id },
          data: { [statusField]: newStatus },
        });
      }
    }
  }
}, { connection: redisConnection });
```

### Common Operation 3: PUT /api/admin/tenants/:id (toggle enabledPlatforms)

```ts
// backend/src/routes/admin/tenants.ts — NEW
import { z } from "zod";
const updateTenantSchema = z.object({
  enabledPlatforms: z.array(z.enum(["KEETA","TALABAT","DELIVEROO","AMERICANA"])).optional(),
});

router.put("/:tenantId/settings",
  requireSuperAdmin,   // or rbac("ADMIN") + scope check
  async (req, res) => {
    const body = updateTenantSchema.parse(req.body);
    // Lockout-safety: ADMIN clearing all platforms is allowed (they see them via bypass),
    // but log it for audit:
    if (body.enabledPlatforms?.length === 0) {
      await writeAuditLog("TENANT_PLATFORMS_CLEARED", { actorId: req.user!.userId });
    }
    const updated = await prisma.tenant.update({
      where: { id: req.params.tenantId },
      data: body,
    });
    res.json(updated);
});
```

## Sources

### Primary (HIGH confidence)
- **Codebase reads (verified 2026-05-13):**
  - `backend/prisma/schema.prisma` L346-429 (Tenant), L452-487 (User), L490-578 (Driver), L602-616 (DriverInventory), L639-673 (Vehicle), L1659-1683 (Notification), L1798-1815 (Penalty), L1816-1838 (Appeal), L208-223 (InventoryItemType enum), L515-528 (Driver document fields)
  - `backend/src/routes/keeta.ts`, `talabat.ts`, `deliveroo.ts`, `americana.ts`, `drivers.ts`, `vehicles.ts`, `penalties.ts`, `driverRestrictions.ts`, `leaveRequests.ts` — line counts + endpoint enumeration
  - `backend/src/middleware/superAdmin.ts`, `tenantScope.ts`, `rbac.ts` — auth + tenant-scope patterns
  - `backend/src/server.ts` L167-239 — router mounting order
  - `backend/src/services/aiInsightsEngine.ts` L680-720 — existing document-expiry scan
  - `frontend/src/components/layout/Sidebar.tsx` — PLATFORMS array + sidebar rendering
  - `frontend/src/contexts/AuthContext.tsx` — User shape
  - `frontend/src/hooks/useRole.ts` — RBAC helper
  - `.planning/phases/08-finance-workbench/08-RESEARCH.md` — workbench pattern template

### Secondary (MEDIUM confidence, official docs)
- **Next.js 14.2 / App Router:** `nextjs.org/docs/app/api-reference/functions/not-found` — `notFound()` semantics (verified 2026-05-13).
- **Prisma 5.22 JSON arrays:** `prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields` — `array_contains` requires path + array-not-string in Postgres (verified 2026-05-13).
- **Next.js middleware/proxy:** `nextjs.org/docs/app/api-reference/file-conventions/middleware` — middleware renamed to `proxy.ts` in 16.0.0; we're on 14.2.35 so `middleware.ts` is current.

### Tertiary (LOW confidence, ASSUMED — flag for /gsd-discuss-phase)
- A1, A2, A3, A5, A6 in Assumptions Log — confirm with founder before Wave 1.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already pinned and in use.
- Architecture: HIGH — flag mechanic is a clean additive column; HR workbench mirrors Phase 8 pattern.
- Pitfalls: MEDIUM — admin-lockout (§3) and serial-uniqueness (§4) are the highest-risk items; both need a /gsd-discuss-phase decision.
- Per-platform polish: MEDIUM — line-count audit done but per-endpoint walkthrough deferred to planning.
- Document expiry: HIGH — existing engine + Notification model carry most of the load.
- Equipment tracking: MEDIUM — DriverInventory model suffices but uniqueness scope needs founder sign-off.

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (30 days for the stable stack; the only fast-moving piece is Next.js, and we're locked on 14.2.35).
