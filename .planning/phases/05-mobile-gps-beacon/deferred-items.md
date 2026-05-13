# Phase 5 — Deferred Items

Items discovered during Phase 5 execution that are **out of scope** for the
current plan but should be addressed in a future phase. Per the GSD scope
boundary policy, executor agents log out-of-scope discoveries here rather
than auto-fixing them.

---

## Pre-existing lint:tenant violations in `backend/src/routes/agent.ts`

**Discovered during:** Phase 5 Wave 2 (05-02-PLAN.md, Task 3)

While extending agent.ts with the new /location, /upload-url, /delivery-photo
routes, I evaluated adding `src/routes/agent.ts` to the `lint:tenant` script
scope. Doing so exposes **8 errors** — but **only 3 are in the new code I
added**; the other 5 are in pre-existing route handlers (`/register`, `/selfie`,
`/commands`, `resolveDriverFromDeviceId`).

The pre-existing pattern in agent.ts is:

```ts
const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { driver: true } });
if (!device || !device.driver) { res.status(404).json(...); return; }
const tenantId = device.driver.tenantId; // ← authoritative
// downstream queries all use tenantId from here
```

This is **functionally tenant-safe** (the `tenantId` used for all downstream
queries comes from the device→driver join, never from user input), but the
static `lint:tenant` rule can't see this — it only inspects the `where` clause
of the first call.

### Specific lint:tenant violations in agent.ts (line numbers as of commit 05-02 Task 3)

| Line | Call | Origin | Note |
|------|------|--------|------|
| 197:28 | `prisma.device.findUnique({ where: { id: deviceId } })` in `/location` | Wave 2 (new) | New code, same pattern as pre-existing |
| 336:28 | `prisma.device.findUnique` in `/upload-url` | Wave 2 (new) | New code, same pattern |
| 393:26 | `prisma.device.findUnique` in `/delivery-photo` | Wave 2 (new) | New code, same pattern |
| 483:26 | `prisma.device.findUnique` in `/selfie` | Pre-existing | Unchanged in Wave 2 |
| 542:30 | `prisma.attendanceRecord.findUnique` in `/selfie` | Pre-existing | Unchanged in Wave 2 |
| 621:28 | `prisma.deviceCommand.findMany({ where: { deviceId, status: "PENDING" } })` in `/commands` | Pre-existing | **Potential real cross-tenant hole** — see below |
| 676:24 | `prisma.device.findUnique` in `resolveDriverFromDeviceId` | Pre-existing | Unchanged in Wave 2 |

### Recommendation

A dedicated future plan (suggest `Phase 5 Wave 5` or a follow-up `Phase 9`)
should:

1. **Refactor the device-lookup pattern** into a helper that returns a typed
   `{ device, driver, tenantId }` triple OR rejects with a 404, so the entry
   point is centralized.
2. **Fix the `/commands` GET endpoint** — it queries `deviceCommand.findMany`
   by deviceId only. If an attacker can guess a `deviceId` UUID of another
   tenant, they could read that tenant's pending commands. Add `device.driverId
   → driver.tenantId` lookup first.
3. **Add `src/routes/agent.ts` to `lint:tenant` scope** once the above is
   refactored.

### Why not auto-fixed in Wave 2

The new Wave 2 code follows the **same pattern** as the surrounding
pre-existing code. Refactoring all of agent.ts (register, heartbeat, selfie,
captured-orders, app-usage, commands, tickets) is a significant structural
modification that:
- Is a Rule 4 architectural change (cross-cutting refactor)
- Would mix tenant-scope hardening with Phase 5 mobile feature work in one
  commit, making review and rollback harder
- Was not in the plan's contract

The lint:tenant scope addition was therefore reverted to avoid breaking
existing CI checks. The functional tenant safety of the new code is verified
by:
- The Wave 0 RED tests (cross-tenant key forgery rejection in
  deliveryPhoto.test.ts)
- Tenant scoping on every Prisma write via `device.driver.tenantId` chain
- The `lint:tenant` script DOES include `src/services/activePlatformAttribution.ts`
  which IS in scope and passes cleanly.
