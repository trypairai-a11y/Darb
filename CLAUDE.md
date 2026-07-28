# CLAUDE.md — Darb 2.0 Delivery Platform

## Project Overview

Darb 2.0 (PRD DARB2-PRD-001 v3.0) is a zone-based delivery and growth platform for Kuwait. Merchants (pharmacies first, then restaurants and retail) push ready, priced orders via API; Darb owns dispatch, the driver, the delivery, money settlement, and the data layer. Fulfilment is 100% subcontracted delivery companies (fleet partners) governed by Darb. The legacy multi-aggregator platform (Keeta/Talabat/Deliveroo/Americana modules) was deleted in the 2026-07 PRD rebuild; their Prisma models remain in the schema (no destructive migrations), but the code surfaces are gone.

## Tech Stack

- **Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind + react-leaflet 4.2.1 (pinned) + TanStack Query
- **Backend:** Express 4 + TypeScript + Prisma 5 (PostgreSQL/Neon) + BullMQ (long-lived hosts only)
- **Mobile:** React Native / Expo 52 driver app (EN + AR, LTR layout by design)
- **Infra:** Vercel serverless (both apps), Docker Compose locally, cron-driven background work

## Surfaces (PRD §5)

The staff rail is five items with no section headings, and the merchant rail is
four (revision #31). Most of what used to be separate rail entries turned out to
be one dataset viewed several ways, so they are segments and tabs now. The old
routes all still resolve as redirects into the merged screen with the right
tab preselected, so bookmarks and notification links keep working.

| Surface | Rail item | Where | Users |
|---|---|---|---|
| Live control room | Live | `/ops` — segments `?view=orders\|drivers\|problems\|areas`, map follows the open segment | SUPERVISOR+ |
| Order console | Orders | `/orders` + OrderOpsPanel | SUPERVISOR+ |
| Money | Money | `/finance` — tabs `?tab=ledger\|vendor-statements\|reconciliation`; shop-statement rows open a per-order detail panel | ACCOUNTANT+ |
| Cash desk | (own rail) | `/cash-desk` (record hand-in) + `/cash-desk/history` | CASH_COLLECTOR, fenced; ACCOUNTANT/SUPERVISOR/OPS_MANAGER also admitted |
| Network + system config | Setup | `/setup` hub → `/zones`, `/pricing`, `/vendors`, `/fleets`, `/settings`, `/assets` | OPS_MANAGER+ |
| Owner cockpit | Today | `/cockpit` | ADMIN |
| Merchant portal | (own rail) | `/vendor/*`: orders, wallet, `/vendor/grow` (Numbers + Messages), settings | VENDOR role, fenced |
| Fleet portal | (own rail) | `/fleet-portal/*` (roster, scorecard, payouts) | FLEET role, fenced |
| Customer tracking | n/a | `/track/[token]` — public, token is the credential | end customer |
| Driver app | n/a | `mobile/` (offers, POD PIN/photo, cash, SOS, points) | drivers |

Redirects left behind: `/ops/sos|jeopardy|alerts|zones` → `/ops?view=…`,
`/finance/reports` → `/finance?tab=…` (forwarding `view` and `type`),
`/finance/remittances` and `/finance?tab=cash` → `/cash-desk` (revision 4 #3
split the hand-in desk back out into its own portal), `/vendor/analytics|campaigns`
→ `/vendor/grow?tab=…`.

**An emergency is never a rail item.** `(dashboard)/ops/layout.tsx` floats
`IncidentAlertBanner` over every ops surface for the oldest un-acknowledged
incident; the red Emergency tile in the Live rail opens the full console over
the map. Nothing about SOS requires navigating to it.

**Do not name a route segment `analytics`** (or `ads`, `pixel`, `banner`).
Next emits the page bundle to `_next/static/chunks/app/(dashboard)/<route>/page-<hash>.js`,
and ad/tracker blockers match those segments, so the chunk is blocked and the
screen renders blank with a `ChunkLoadError` while the server happily serves it
200. This bit `/vendor/analytics` in production; it is `/vendor/grow` now.
Backend endpoints are fine (`/api/vendor/analytics` was probed and reaches the
server), it is only the static chunk path that is at risk.

## Key backend routes

- `/api/partner` — merchant order intake, API-key auth (`X-Api-Key`, sha256-hashed in ApiKey model), idempotent on externalRef. Key CRUD under `/api/vendors/:id/api-keys`.
- `/api/track/:token` — public tracking payload + `/rating` + `/tip` + `/cancel` (rate-limited; strict safe subset, never podPin/customerPhone).
- `/api/vendor` — vendor portal (JWT vendorId, vendorContainment fences VENDOR tokens).
- `/api/fleet` — fleet portal (JWT fleetPartnerId, fleetContainment); `/api/fleets` staff CRUD.
- `/api/cockpit/summary` — founder dashboard (ADMIN).
- `/api/wallets` — ledger, remittances, vendor statements, refunds processing. `/vendor-statements/:id/transactions` is the per-order detail behind one statement (revision 4 #4).
- `/api/delivery-plans` — named by-zone / by-km price lists (revision 4 #7). Rates are replaced wholesale, never per cell.
- `/api/users/:id/permissions` + `/api/users/:id/invite` + public `/api/auth/set-password` — per-surface access and self-service passwords (revision 4 #12).
- `/api/fleets/export.xlsx` — three-sheet workbook: fleets, scorecards, payouts (revision 4 #10). `?fleetId=` narrows all three sheets to one partner; that is what the Export button inside the `/fleets` detail panel calls, since the scorecard and payout history render nowhere else.
- `/api/webhooks/foodics/:secret` + `/api/webhooks/twilio-whatsapp` — public inbound.
- `/api/cron/dispatch-sweep` + `/api/cron/daily` — Bearer CRON_SECRET, fail-closed. **Vercel Hobby only allows daily crons**, so dispatch needs an external minute-level ticker in production (see Deployment notes).

## Domain invariants (do not break)

- **Order FSM** (`orderStateMachine.ts`): every transition is a status-guarded `updateMany`; count 0 = lost race = 409. FAILED→RETURNED is the only exit from FAILED. Scheduled orders sit in CREATED until the cron sweep advances them.
- **Wallet** (`services/wallet/`): double-entry, append-only, idempotencyKey on every posting. Corrections are compensating transactions, never edits. Refunds never touch DRIVER_CASH. Tips: driver keeps 100% (CLEARING debit / DRIVER_CASH credit). Fleet payouts are computed from delivered-order counts, not accrual legs.
- **Dispatch** (`dispatch/dispatchEngine.ts`): serialized 15s offers, offerRound compare-and-set, radius auto-widens per round, auto-batching = one pickup multiple drops only (kill switch `FulfillmentSettings.batchingEnabled`); decline/expiry closes the whole batch; `releaseDriverToOnline` keeps batched drivers BUSY until the last active order ends. Throttled drivers (fleet discipline) rank last. **NO_DRIVER is a pause, not a terminus** (revision 4 #1): `exhaustDispatch` stamps `redispatchAttempts`/`nextRedispatchAt`, the sweep's third leg returns due orders to DISPATCHING on a 60s/2m/5m/10m backoff, and retry rounds pass `uncapped` to `effectiveRadiusKm` so the nearest online driver wins regardless of `maxSearchRadiusKm`. Only the first exhaustion notifies a supervisor.
- **Pricing** (`services/pricingService.ts`): a vendor is priced by its assigned `DeliveryPlan` — by zone (per-plan rate grid) or by kilometre (ordered tiers, `maxKm` null = "and above"). A blank means unserviceable in both. **A vendor with no plan keeps the original `FulfillmentSettings` + `ZoneSurcharge` pricing**, which is what lets merchants migrate one at a time. Km distance comes from `services/distanceService.ts` (Google Distance Matrix, cached in `DistanceCache` on coordinates rounded to 4dp), falling back to haversine with `distanceSource: "straight-line"` on the quote rather than rejecting the order.
- **Permissions** (`services/permissionService.ts` + `middleware/requireSurface.ts`): role default, then per-user `UserSurfacePermission` override. Absence of a row means inherit, so this ships with no backfill. **ADMIN is never gated** — otherwise an admin could set their own PEOPLE surface to NONE and lose the endpoint that would undo it.
- **Containment:** VENDOR tokens only reach /api/auth + /api/vendor + /api/foodics + /api/events; FLEET only /api/auth + /api/fleet + /api/events; CASH_COLLECTOR only /api/auth + /api/wallets/remittances + /api/drivers + /api/events.
- **Tenant scope:** every request wrapped by tenantScope; cross-tenant code is cron/webhook-internal only and marked with eslint-disable comments explaining why.

## Commands

```bash
docker-compose up -d                    # local stack (Postgres on :5433)
cd backend && npm run dev               # Express :8001
cd frontend && npm run dev              # Next.js :3000
cd backend && npm test                  # Jest suite
cd backend && npx tsx prisma/seed-darb2.ts   # Darb 2.0 seed (zones, vendor, fleet, couriers)
```

Seeded portal logins: `fleet@darb.demo / fleet1234` (FLEET). Vendor users are created from `/vendors/[id]`. Staff accounts are created by invite (no admin-set password) — the invite link is returned in the response and shown in the modal for copy-paste until `SENDGRID_API_KEY` or `RESEND_API_KEY` is configured.

## Migrations (IMPORTANT)

`prisma migrate dev` DOES NOT WORK in this repo: the migration history predates a `db push` era and can never replay onto a shadow DB. The working pattern:

1. Edit `schema.prisma`. Enum values FIRST in their own migration (Postgres cannot use a new enum value in the transaction that adds it).
2. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_<name>/migration.sql`
3. `npx prisma db execute --file ... --url "$DATABASE_URL"` then `npx prisma migrate resolve --applied <name>` then `npx prisma generate`.
4. Prod applies pending migrations via `migrate deploy` on Vercel build; the datasource `directUrl = env("DATABASE_URL_UNPOOLED")` is what makes that work on Neon (the pooler silently breaks migrate). Verify with `prisma migrate status` against prod after deploying schema changes.

## Deployment notes

- Deploy: `vercel --prod --yes` from backend/ and frontend/ (node 20: `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`). No alias step: `darbkw.vercel.app` / `pair-darb.vercel.app` (frontend) and `pair-darb-api.vercel.app` (backend) are project domains and auto-track every prod deploy.
- Backend prod env needs: DATABASE_URL, DATABASE_URL_UNPOOLED, CRON_SECRET, PUBLIC_TRACKING_BASE_URL, JWT secrets; TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM activate real WhatsApp (stub-warns until set).
- **Dispatch on Vercel Hobby:** vercel.json crons are daily only. `/api/cron/dispatch-sweep` must be hit every minute by an external ticker (cron-job.org or similar, `Authorization: Bearer $CRON_SECRET`) or offers expire only daily. Upgrading to Vercel Pro and setting the cron back to `* * * * *` is the clean fix.
- The BullMQ workers + in-process schedulers only run in the `app.listen` block (non-Vercel hosts); on Vercel the two cron endpoints are the only background drivers.

## Testing conventions

- House pattern: `getMockPrisma()` from `__tests__/setup.ts`, delegates attached per-suite, `jest.mock` at module boundaries, supertest for route auth boundaries.
- The suite has a set of intentionally-failing legacy/TDD-red suites (agent tools scaffolding, floor, finance legacy). The gate for new work is "no NEW failing suites", not zero failures. `agentRateLimit` and `locationIngest` flake under parallel load; they pass in isolation.

## Coding conventions

- TypeScript strict; Prisma for all DB access; money is Prisma.Decimal, serialized as 3dp strings (`toFixed(3)`).
- Routes: authMiddleware + tenantScope on the router, rbac() per route, try/catch → `{ error }`, getPagination/paginatedResponse.
- Frontend: Tailwind forest/sand tokens, rounded-pill, font-display; logical RTL props (`ms-`, `text-start`); money via formatKwd; ar + en both required for every new i18n key (typed Messages interface enforces it — `t()` itself takes a plain string, so `tsc` is the only thing that catches a missing key).
- The public tracking surface uses `lib/trackApi.ts` (plain fetch), NEVER the shared axios instance (its 401 interceptor redirects to /login).
- No em dashes in user-facing copy; `n/a` for empty table cells.
