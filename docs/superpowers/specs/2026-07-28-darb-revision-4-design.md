# Darb 2.0 — Revision 4 design

Source: `docs/Darb-Requirements-and-Revision-Notes-4.docx` (13 client edits).
Date: 2026-07-28. Branch: `darb2/prd-execution`.

Three of the thirteen edits ask for behaviour the platform already has. They are
called out as such below and reduce to a regression test plus, in one case, a
small interaction polish. The remaining ten are real work, and two of them
(delivery plans, per-user permissions) carry new schema.

---

## Decisions taken before design

| Question | Decision |
|---|---|
| What "different portal" means for cash (#3) | A fenced portal with its own login and rail, mirroring `/fleet-portal`. New `CASH_COLLECTOR` role. |
| Distance source for km pricing (#7) | Google Distance Matrix driving distance, cached, with a haversine fallback flagged on the quote. |
| Excel format for the fleet export (#10) | A real three-sheet `.xlsx` built server-side with `exceljs`. |
| Invite delivery (#12) | Single-use expiring token, emailed via the existing `sendEmail` helper, with the link also shown for copy-paste. |
| Behaviour after dispatch exhausts (#1) | Retry forever on a backoff, with the radius cap lifted on retry rounds. |
| One row of a statement detail report (#4) | One row per order, expandable to the wallet entries behind it. |
| Permissions granularity (#12) | Per-surface `NONE / VIEW / EDIT`, overriding the role default. |

---

## A. Dispatch (#1, #2)

### What already exists

`declineOffer` in `backend/src/services/dispatch/dispatchEngine.ts` already ends
with `enqueueDispatchNext(offer.orderId, tenantId)`, so a declined order is
re-offered to the next-ranked driver without any human involvement. **Edit #2 is
already satisfied**; it gets a regression test that pins the behaviour, not a
rewrite.

Dispatch also already auto-offers on order creation and already widens the search
radius every `radiusWidenAfterRounds` rounds up to `maxSearchRadiusKm`
(`effectiveRadiusKm`). Both halves of "auto dispatch" in edit #1 are in place.

### The actual gap

When `runDispatchRound` runs out of rounds or finds no candidates it calls
`exhaustDispatch`, which moves the order to `NO_DRIVER`, notifies supervisors,
and stops. Nothing ever picks the order up again. The screenshot in the client
note — `DRB-DWPH-0130`, No Driver, SLA `-7051:57` — is an order that has sat in
that state for days. That dead end is what both edits are pointing at.

### Change

`exhaustDispatch` keeps its current behaviour and additionally stamps two new
`DeliveryOrder` columns: `redispatchAttempts` (incremented) and
`nextRedispatchAt` (now + backoff).

Backoff schedule by attempt count: 60s, 2m, 5m, 10m, then 10m indefinitely. The
order is never abandoned; the supervisor notification still fires on the first
exhaustion so a human can intervene, but is not required to.

`sweepDispatch` grows a third leg after the existing expire and advance legs:

```
leg 3: NO_DRIVER orders with nextRedispatchAt <= now
       → reset offerRound to RETRY_ROUND_BASE
       → transitionOrder NO_DRIVER → DISPATCHING
       → dispatchNext
```

`NO_DRIVER → DISPATCHING` is already a legal transition in
`orderStateMachine.ts`, so no FSM change is needed. The leg is status-guarded the
same way the others are, so an order cancelled or manually assigned between ticks
simply stops matching the selector.

`effectiveRadiusKm` gains an `uncapped` flag. `selectCandidates` passes it when
`order.redispatchAttempts > 0`, which makes the retry rounds skip the
`distanceKm > radius` filter entirely. Candidates stay sorted nearest-first, so
the nearest online driver anywhere in the tenant receives the offer. This is the
"send it to the nearest driver" the client asked for, and it only applies after
the normal capped rounds have failed, so ordinary dispatch is unaffected.

The retry legs run on the same cron tick as the rest of the sweep, which on
Vercel Hobby means they depend on the external minute ticker documented in
`CLAUDE.md`. No new scheduling surface.

### Tests

- declining an offer enqueues the next round (pins #2)
- exhausting dispatch stamps `nextRedispatchAt` and increments the attempt count
- the sweep returns a due `NO_DRIVER` order to `DISPATCHING`
- an order not yet due is left alone
- retry rounds offer to a driver outside `maxSearchRadiusKm`
- cancelling an order stops the retries

---

## B. Money (#3, #4, #5)

### #3 — Cash desk portal

`CASH_COLLECTOR` joins the `UserRole` enum. A new `/cash-desk` route group in the
frontend carries its own rail with two entries, Record hand-in and History, and
is fenced by a `cashDeskContainment` middleware modelled on the existing
`fleetContainment`: a `CASH_COLLECTOR` token reaches `/api/auth`,
`/api/wallets/remittances*` and `/api/events`, nothing else.

`RemittancesPanel` moves from `components/finance/` to the new portal
essentially intact. `/finance` drops from four tabs to three (ledger, shop
statements, nightly checks) and `?tab=cash` redirects to `/cash-desk` so existing
deep links and the Driver cash stat card keep working. `ACCOUNTANT+` staff can
still reach the cash desk; the fence restricts the dedicated role, it does not
lock finance staff out.

### #4 — Statement detail

New endpoint:

```
GET /api/wallets/vendor-statements/:id/transactions
```

It resolves the statement's vendor and period, then returns one row per
underlying event:

| Kind | Source | Columns carried |
|---|---|---|
| `DELIVERY` | `DeliveryOrder` delivered in the period | date, order number, customer total, delivery fee, COD net |
| `REFUND` | `Refund` processed in the period | date, order number, refunded amount |
| `PAYOUT` | the statement's `payoutTxId` | date, amount |

Each row carries the `WalletEntry` rows behind it under `entries` so the UI can
expand an order into its raw double-entry postings. Money is serialised as 3dp
strings, as everywhere else. The response also echoes the statement's opening and
closing balance so the panel can foot the report.

The Shop statements list gains a row click that opens a detail panel showing this
report.

### #5 — Per-shop export

The detail panel's Export CSV emits that one shop's detailed statement:
`statement-<shop-code>-<period>.csv`. The list-level export changes from one
combined flat file to a per-shop export — selecting rows and exporting produces
one detailed file per selected shop, matching the client's "same concept" note.
`lib/csv.ts` gains nothing new; the panel builds its rows and calls
`downloadCsv` per shop.

---

## C. Zones and pricing (#6, #7)

### #6 — Zone drawing

`components/map/ZonePolygonEditor.tsx` is already a dependency-free
click-to-add-vertex editor: each map click appends a pinpoint and a dashed
`Polyline` connects them as you go. **Edit #6 is substantially already
satisfied.**

The one Google Earth behaviour it lacks is the rubber band: in the measure tool a
dashed segment follows the cursor from the last placed point, and a running
distance is displayed. The editor gains both — a cursor-tracking segment rendered
from the last vertex on `mousemove` (only while not dragging a handle), and a
running perimeter in kilometres in the control bar next to the vertex count.

### #7 — Delivery plans

Three new models plus one column:

```prisma
model DeliveryPlan {
  id        String   @id @default(uuid())
  tenantId  String
  name      String              // custom, client-facing, e.g. "Pharmacy standard"
  type      DeliveryPlanType    // ZONE | KM
  isActive  Boolean  @default(true)
  zoneRates DeliveryPlanZoneRate[]
  kmTiers   DeliveryPlanKmTier[]
  vendors   Vendor[]
  @@unique([tenantId, name])
}

model DeliveryPlanZoneRate {
  // originZoneId == destZoneId carries the intra-zone flat fee.
  // An absent row for a cross-zone pair means UNSERVICEABLE_PAIR, exactly as
  // ZoneSurcharge behaves today.
  planId, originZoneId, destZoneId, feeKwd Decimal @db.Decimal(10,3)
  @@unique([planId, originZoneId, destZoneId])
}

model DeliveryPlanKmTier {
  // Ordered by maxKm. The last tier may have maxKm null, meaning "and above".
  // feeKwd null marks the tier unserviceable (the client's blank cell).
  planId, maxKm Decimal? @db.Decimal(6,2), feeKwd Decimal? @db.Decimal(10,3)
}
```

`Vendor.deliveryPlanId` is nullable. A vendor with no plan falls through to
today's `FulfillmentSettings.intraZoneFeeKwd` + `ZoneSurcharge` behaviour, so
nothing breaks before plans are configured and the existing pricing tests keep
passing unchanged.

`pricingService.quoteDelivery` branches:

- no plan → current behaviour, unchanged
- `ZONE` plan → same shape as today but reading `DeliveryPlanZoneRate`; the
  intra-zone row supplies the base fee, a missing cross-zone row is
  `UNSERVICEABLE_PAIR`
- `KM` plan → resolve distance, find the first tier whose `maxKm` is greater than
  or equal to it, `null` fee is `UNSERVICEABLE_PAIR`

All money math stays on `Prisma.Decimal`.

New `services/distanceService.ts`:

```
drivingDistanceKm(tenantId, origin {lat,lng}, dest {lat,lng})
  → { km, source: "google" | "straight-line" }
```

It calls the Google Distance Matrix API with `GOOGLE_MAPS_API_KEY` (already
present in `config/env.ts`, currently unused), caching results in a new
`DistanceCache` table keyed on the coordinate pair rounded to 4 decimal places
with a 30 day TTL — repeat orders from the same branch to the same building are
the common case, so the cache carries most of the traffic. A missing key, a
non-`OK` response, or a thrown error falls back to `haversineMeters` from
`utils/geo` and marks the result `straight-line`. The quote carries the source
through so the order record shows how it was priced.

The distance is Google's routing distance, explicitly not the driver's traced
route, which is what the client asked for.

`/pricing` becomes a plan list (name, type, vendors assigned, status) with a
create button and an editor per plan: the zone editor is today's surcharge grid,
the km editor is an ordered tier table with editable breakpoints and prices and a
blank-means-unserviceable cell. Both breakpoints and prices are editable at any
time. Vendor profile gains a Delivery plan picker in the profile tab.

---

## D. Vendors and people (#8, #9, #11, #12)

### #8, #9 — Phone fields

`VendorBranch.phone` and `User.phone` already exist in `schema.prisma`. Both
edits are UI and serialiser work only: a Phone number column on the vendor
Branches table (and on its create/edit form), and a Phone number field on the
Create portal user form, passed through the existing vendor-users endpoint.

### #11 — Account Manager notifications

`ACCOUNT_MANAGER` joins the `UserRole` enum and is appended to the `ROLES` array
driving the notifications matrix on `/settings`. The notification rules API is
already keyed on an arbitrary role string, so no backend change is required
beyond accepting the new enum value. `ROLE_COLORS` gains a swatch.

### #12 — Self-service password and permissions

**Invites.** New `UserInvite` model: `userId`, `tokenHash` (sha256, never the raw
token), `expiresAt`, `usedAt`. `POST /api/users/invite` creates the user with a
random unusable password hash and an invite row, calls `sendEmail` with the link,
and returns `{ inviteUrl, expiresAt }`. The Invite User modal loses its Password
field and shows the returned link with a copy button, so invites work today by
copy-paste and start arriving by email the moment `SENDGRID_API_KEY` or
`RESEND_API_KEY` is set. A public `/set-password` page posts the token and a new
password to `POST /api/auth/set-password`, which verifies the hash, checks expiry
and single use, sets the password, and stamps `usedAt`. Tokens expire after 72
hours.

**Permissions.** New `UserSurfacePermission` model: `userId`, `surface`, `level`
(`NONE | VIEW | EDIT`), unique on `(userId, surface)`. Surfaces are the staff
rail plus the fenced ones: `LIVE`, `ORDERS`, `MONEY`, `SETUP`, `TODAY`,
`CASH_DESK`, `PEOPLE`.

Resolution order is role default, then per-user override. The rail hides
`NONE` surfaces, but the enforcement that matters is server-side: `rbac()` gains
a surface argument and consults the resolved permission before the role check, so
a hidden surface is also an unreachable API. Absence of a row means "inherit the
role", which keeps every existing user working with no backfill.

**Account managers.** New `AccountManagerVendor` join (`userId`, `vendorId`,
unique on the pair). The existing `User.managedCompanies` relation points at the
legacy `Company` model, which is not the Darb merchant, so it cannot be reused.
The Permissions page shows a vendor picker for `ACCOUNT_MANAGER` users, and their
vendor-scoped queries filter through the join.

---

## E. Fleet and setup (#10, #13)

### #10 — Fleet Excel export

New `GET /api/fleets/export.xlsx` (`OPS_MANAGER+`) streams a workbook built with
`exceljs`, already a backend dependency:

| Sheet | Rows | Columns |
|---|---|---|
| Fleets | one per fleet | Fleet, Roster, Discipline, Fee per order, Status |
| Scorecards | one per fleet | Fleet, On-time rate, Acceptance rate, Utilisation, Delivered orders, Online hours, Contracted hours, Rating |
| Payouts | one per statement | Fleet, Period, Orders, Fee per order, Total, Status |

Percentages are written as numbers with a percent format and money with a 3dp
format, so the file sorts and sums correctly in Excel rather than arriving as
text. The Fleets page Export button downloads from this endpoint instead of
building a client-side CSV.

### #13 — Darb-only equipment

`AddPlatformEquipmentModal` loses its Platform dropdown entirely rather than
becoming a one-option select, and the equipment rows on `/assets` are filtered to
Darb. The demo data in the page, which currently seeds `KEETA` and `TALABAT`
pools, is cut to Darb rows only. This matches the PRD rebuild, which deleted the
multi-aggregator surfaces but left this modal behind.

---

## Schema changes and migration order

`prisma migrate dev` does not work in this repo. Both migrations follow the
`migrate diff` → `db execute` → `migrate resolve` pattern in `CLAUDE.md`, and
Postgres cannot use a new enum value in the transaction that adds it, so enum
values go first and alone.

**Migration 1 — enum values only**
- `UserRole` += `ACCOUNT_MANAGER`, `CASH_COLLECTOR`
- new enums `DeliveryPlanType` (`ZONE`, `KM`), `PermissionLevel` (`NONE`, `VIEW`, `EDIT`)

**Migration 2 — models and columns**
- new: `DeliveryPlan`, `DeliveryPlanZoneRate`, `DeliveryPlanKmTier`,
  `DistanceCache`, `UserInvite`, `UserSurfacePermission`, `AccountManagerVendor`
- altered: `Vendor.deliveryPlanId`, `DeliveryOrder.redispatchAttempts`,
  `DeliveryOrder.nextRedispatchAt`

Every added column is nullable or defaulted, so the migration is safe against
live data and no destructive change is introduced.

## Non-goals

- No changes to the wallet's double-entry invariants. The statement detail report
  reads postings, it never writes them.
- No changes to the order FSM beyond using the existing `NO_DRIVER → DISPATCHING`
  transition.
- No backfill of permissions. Absence means inherit the role.
- The legacy Prisma models from the deleted aggregator platform stay in the
  schema untouched, per the standing no-destructive-migrations rule.

## Verification

- `cd backend && npm test` — gate is no NEW failing suites, per the house rule
- `cd backend && npx tsc --noEmit` and `cd frontend && npm run build`
- every new i18n key added in both `en` and `ar`
- deploy backend and frontend with `vercel --prod --yes`, then
  `vercel alias set <host> frontend-ebon-nine-34.vercel.app`
- `npx prisma migrate status` against prod after the schema deploy
