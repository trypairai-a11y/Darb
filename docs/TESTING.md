# Darb 2.0 — Test Handover

Everything below was exercised end to end on 20 Jul 2026. Each surface is
listed with how to reach it, what to click, and what "correct" looks like.

---

## 1. Where to test

| Surface | Local | Production |
| --- | --- | --- |
| Ops / vendor web app | http://localhost:3000 | https://pair-darb.vercel.app (also `frontend-ebon-nine-34.vercel.app`) |
| API | http://localhost:3001 | https://backend-snowy-ten-52.vercel.app (also `pair-darb-api.vercel.app`) |
| Swagger | http://localhost:3001/api-docs | — |
| Driver app | Expo, see §6 | — |

### Logins

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Admin | `osama@fleet.kw` | `demo123` | `/ops` |
| Ops manager | `ahmed@fleet.kw` | `demo123` | `/ops` |
| Supervisor | `khalid@fleet.kw` | `demo123` | `/ops` |
| Accountant | `fatima@fleet.kw` | `demo123` | `/finance` |
| Vendor portal | `vendor@brgb.kw` | `demo1234` | `/vendor` |

The login page's **Enter demo workspace** button signs in as the admin — verified working.

---

## 2. Bringing the local stack up

```bash
open -a Docker                       # wait for `docker info` to succeed
cd /Users/mac/Documents/Darb
docker compose up -d postgres        # host port 5433
docker start darb-redis-test         # or: docker run -d --name darb-redis-test -p 6380:6379 redis:7-alpine

cd backend  && npm run dev           # :3001
cd frontend && npm run dev           # :3000
```

Use **node@20** (`export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`). Node 25
breaks Expo and the Vercel CLI.

If `node_modules` has been evicted by iCloud you'll see `ETIMEDOUT`/`ECANCELED`
on reads — `npm ci` in the affected package fixes it.

**Redis matters.** The backend treats `REDIS_URL=redis://localhost:6379` as
"unset" and silently disables every BullMQ worker. `backend/.env` now points at
`redis://127.0.0.1:6380`, which is why offer-expiry timers, the Foodics worker
and wallet reconciliation actually run. On boot you should see:

```
dispatch worker started · foodicsWorker started · walletReconciliationWorker started
```

---

## 3. Automated checks — current state

| Suite | Result |
| --- | --- |
| Backend `npm test` | **85 suites pass / 42 fail** — all 42 are pre-pivot RED scaffolding (`agent/`, `decisions/`, `floor.*`, `finance/*`, notification channels). Same set as before this work; no Darb 2.0 suite fails. |
| Backend darb2 subset (wallet, dispatch, orders, vendors, foodics, zones) | **all pass** |
| Frontend `npx vitest run` | 14 files pass / 15 fail — all in `floor/`, `driverFile/`, `finance/` RED scaffolding, unchanged from baseline |
| Frontend `tsc --noEmit` | clean |
| Frontend `npm run build` | succeeds, all 114 routes |
| Mobile `npx jest` | **16/16 suites, 62/62 tests pass** |
| `scripts/e2e-order.ts` | **62 assertions pass**, 3 consecutive runs |
| `prisma/smoke-test-pages.ts` | 81 endpoints green, 10 "200 but empty" (all legacy Darb 1.0 — see §7) |

`middleware/agentRateLimit.test.ts` fails only when the machine is loaded; it
passes in isolation. Timing-sensitive, not a regression.

---

## 4. The main flow to test — order to cash

This is the spine of the product and the thing worth testing first.

```bash
cd backend && npx tsx scripts/simulate-drivers.ts   # puts 5 couriers online with live GPS
```

Then, in a second terminal:

```bash
npx tsx scripts/e2e-order.ts
```

It proves, over real HTTP: staff creates a COD order → the fee is quoted from
the zone matrix → the dispatch worker offers it to the nearest online courier →
the courier accepts → milestone stepper (with idempotent replay) → POD PIN
delivery → wallet postings land → the vendor portal sees it.

**To do it by hand instead:**

1. Run the simulator so couriers are online (they go stale after 3 min without GPS).
2. Sign in as the vendor → **New order** → pick the Salmiya branch, drop the pin
   in Hawally, COD, total `5.000` → the fee should quote **KD 1.750**
   (1.250 intra-zone flat + 0.500 Salmiya→Hawally surcharge).
3. Watch it appear on `/orders` as **Dispatching**, then **No Driver** or assigned.
4. Sign in as admin → `/ops` — the courier moves on the map.
5. After delivery, `/finance` should show driver cash and vendor payables rise by
   the right split: driver +total (5.000), vendor +(total − fee) (3.250),
   platform revenue +fee (1.750).

The ledger is double-entry — every posting has balanced legs, and re-running the
same order is idempotent. `/vendor/wallet` shows the running balance per entry.

---

## 5. Screen-by-screen checklist

Nav is deliberately slim (`SHOW_LEGACY=false`, `SHOW_ADVANCED=false` in
`frontend/src/components/layout/navConfig.ts`). Hidden routes still work by URL.

### Operations
- **`/ops`** — live map, Kuwait zone polygons, courier markers, at-risk order
  panel, stalled/GPS-stale/SOS counters.
- **`/ops/sos`** — 2 open demo incidents seeded (an SOS on Gulf Road and an
  accident in Salmiya), each with a mini-map, live SLA timer and
  Acknowledge / Resolve / Call. A red alert banner rides the top.
- **`/orders`** — all 8 delivery orders, status pills, SLA countdown, filters.

### Network
- **`/zones`** — 8 zones with Arabic names + polygon map. *(This page returned a
  500 on every load until today — see §8.)*
- **`/pricing`** — 8×8 zone-to-zone surcharge matrix, intra-zone flat fee editor.
- **`/vendors`** — Burger Boulevard, **2 branches** *(read as 0 until today)*.

### Finance
- **`/finance`** — vendor payables, driver cash on hand, and **Fees today**
  *(permanently blank until today)*.
- **`/finance/remittances`** — record a hand-in; one demo remittance (KD 10.000,
  Anil Kumar) with its note showing *(notes were unreachable until today)*.

### System
- **`/settings`** — companies, users, notifications, profile tabs.
- **`/assets`** — fleet assets.

### Vendor portal (sign in as `vendor@brgb.kw`)
- **`/vendor`** — 4-lane order board (Incoming / En route / Picked up / Done
  today), wallet balance, pause switch.
- **`/vendor/orders/new`** — order form with map pin drop.
- **`/vendor/wallet`** — COD settlement ledger with running balance + monthly CSV.
- **`/vendor/settings`** — profile and branches *(rendered blank until today)*,
  plus a pause/resume toggle *(never persisted until today)*.

**Vendor containment is enforced** — a VENDOR token gets 403 on `/api/drivers`,
and the vendor sidebar shows only vendor items. Verified in the browser and in
the e2e run.

---

## 6. Driver app

```bash
cd mobile && npx expo start          # node@20, then open in Expo Go
```

Tap **Use demo driver** (or set `EXPO_PUBLIC_AUTO_DEMO_DRIVER=1`). It posts
enrollment code `DEMO` and comes back as **Qadir Baloch** (Al Hazm tenant).
Verified working against the local backend: `/register`, `/state`, `/profile`
and `/stats` all return 200.

Point it at the local backend with `EXPO_PUBLIC_API_URL=http://localhost:3001`;
it otherwise defaults to production.

Remote push needs an EAS dev build — Expo Go only covers the foreground poll path.

---

## 7. Known gaps (not regressions)

- **10 legacy endpoints return `200` with empty data**: live-map, attendance/live,
  shifts/summary, keeta/courier-details, talabat sessions daily-overview and
  drivers/summary, deliveroo orders/shifts summary, americana assignments,
  orders daily-by-platform. These are Darb 1.0 surfaces whose seed data is
  date-relative and has aged out. They're hidden from nav; they render fine, just
  with nothing in them. Re-seed with `npm run prisma:seed:demo-refresh` if you
  want them populated.
- **42 backend / 15 frontend test files are RED by design** — scaffolding for the
  AI agent, decisions, floor router and finance services that were never built.
- **Foodics UI is hidden** behind `FOODICS_UI=false` until the partner app is
  approved. The OAuth/webhook backend is there and its tests pass.
- **Production has no darb2 demo seed** — prod tables exist but the vendor,
  zones and orders above are local only.

---

## 7b. Second pass — contract drift (commit `f486ca1` … see §8b)

A 32-agent adversarial sweep after the first pass found that four of the six
original bugs were instances of one systemic pattern — **frontend/backend
contract drift**, where the client sends or reads a field name the server does
not use. Hunting that pattern deliberately turned up seven more, several of
which made a whole page write-dead. All are fixed; see §8b.

The lesson for future work: this codebase has no mechanical guard tying
`frontend/src/lib/darbApi.ts` to the zod schemas in `backend/src/routes/`.
Nothing fails at compile time when they disagree — the request just 400s at
runtime, and several call sites swallowed that silently.

## 8. Fixed while testing (commit `f486ca1`)

Five defects, all in the shipped v1 surface, all found by actually clicking
through it rather than by the test suites:

1. **`/zones` returned 500 on every request.** The page imported the pure helper
   `zoneRingLatLngs` from `ZonePolygonsLayer`, which imports `react-leaflet` at
   module scope and touches `window` during SSR. Moved the leaflet-free geometry
   into `components/map/zoneGeometry.ts`.
2. **Finance "Fees today" was always an em dash.** The page calls
   `GET /api/wallets/entries` (tenant-wide) but only `/accounts/:id/entries`
   existed, so the query 404'd. Added the tenant-wide route with
   `accountId`/`type`/`dateFrom`/`dateTo` filters. Now reads KD 5.250.
3. **Vendors list always showed 0 branches** — the API returns a flat
   `branchCount`, the table read `_count.branches`.
4. **Vendor portal profile was blank.** `/api/vendor/me` returns the vendor at
   the root; the pages read `data.vendor`. Branches worked only because they sit
   at the root too. The same bug kept the order-board pause banner permanently hidden.
5. **Vendor pause/resume never persisted** — the client posted `{ isPaused }`
   while the endpoint validates `{ paused }`, so every toggle 400'd silently.
6. **Remittance notes were unreachable** — stored on the wallet transaction memo
   (Remittance has no note column), never joined by the list endpoint.

Both sides are deployed to production and the legacy aliases re-pointed.

## 8b. Second-pass fixes

Found by adversarially verifying the first six fixes and then hunting the same
defect classes. Each was reproduced against the running stack before and after.

**Vendor order creation was impossible.** Three stacked faults: the order form
called `/api/zones/quote` and `/api/zones`, which VENDOR tokens are contained
away from (403); the submit gate read `quote.serviceable` on a response that
returns `ok`, so the button never enabled; and the payload sent flat
`dropoffLat/dropoffLng` where the schema wants a nested `dropoff`. Added
vendor-scoped `GET /api/vendor/zones` and `POST /api/vendor/quote` (a vendor may
only quote from its own branches — foreign branch → 404) rather than widening
the containment allowlist. Verified in the browser: the fee now quotes
"KD 1.750 (Salmiya → Hawally)" and the order persists.

**Vendor order cancel always 400'd.** The client called `cancelOrder(id)` with
no reason and the confirm modal had no field to collect one. `ConfirmModal` now
takes `children` and `confirmDisabled`, and the cancel flow collects a reason.

**`/pricing` was write-dead.** The client wrapped the matrix as `{surcharges}`;
the endpoint takes a bare array. Because the save threw, the intra-zone fee on
the next line never saved either. *Note: that PUT is a full replace — sending a
partial array deletes the rest of the matrix. `npx tsx prisma/seed-darb2.ts`
restores it.*

**SOS resolution notes were silently discarded.** Client sent `{note}`, schema
declares `resolutionNote`; zod stripped it and returned 200 with a success
toast. Data loss behind a green checkmark.

**Creating a vendor or a branch with any blank optional field 400'd.** The forms
send `null`; the create schemas used `.optional()` (which rejects null) while
the sibling update schemas correctly used `.nullable().optional()`.

**Branch edit and delete 404'd.** The client invented a vendor segment;
the routes mount at `/api/vendors/branches/:branchId`.

**Finance KPIs would have hard-zeroed in production.** `walletsApi.accounts()`
was unpaginated against a server that clamps `limit` to 100. With ~1 wallet
account per driver and 95 drivers, the platform-revenue account falls off page
one, so "Fees today" would confidently render `KD 0.000`. Same clamp truncated
the remittance held-balance lookup and the vendor CSV statement. Added
`fetchAllPages()` and used the server-side `type=PLATFORM_REVENUE` filter.

**My own new `/api/wallets/entries` had two defects:** a malformed `dateFrom`
returned a 500 leaking the server path and live tenantId, and it parsed dates as
UTC while its sibling in the same file used the local-time helpers — a 3-hour
window skew in Kuwait. Both fixed.

## 9. Still open — needs a decision, not a patch

**Two agent endpoints accept unauthenticated writes.** `POST /api/agent/location`
and `POST /api/agent/captured-orders` take a body-supplied `driverId` that is
never checked against the authenticated device. Proven live with no auth header:
another courier was flipped online, and a forged captured-order row persisted.
I did not fix these — they sit on the driver app's hot path and tightening auth
there risks breaking the mobile client, so it needs a deliberate call rather
than a same-session patch. **Treat as ship-blocking.**

**`Job Grade` in Settings → Users is a dead control.** `jobGrade` appears
nowhere in the backend outside the schema; the update 404s and the dropdown
snaps blank. Either wire it up or hide the field — a product decision.

**The `no-prisma-without-tenant` lint rule cannot catch route-level holes.** It
runs against a hand-maintained ~70-path allowlist, so new files are unprotected
by default.

**Nothing enforces the leaflet SSR boundary.** `ZonePolygonsLayer` still
re-exports the geometry helpers, so importing them from there compiles cleanly
and silently restores the `/zones` 500. A `no-restricted-imports` rule would
make it durable.
