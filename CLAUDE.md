# CLAUDE.md — Darb 2.0 Delivery Platform

## Project Overview

Darb 2.0 (PRD DARB2-PRD-001 v3.0) is a zone-based delivery and growth platform for Kuwait, built by Pair. Merchants (pharmacies first, then restaurants and retail) push ready, priced orders via API; Darb owns dispatch, the driver, the delivery, money settlement, and the data layer. Fulfilment is 100% subcontracted delivery companies (fleet partners) governed by Darb. The legacy multi-aggregator platform (Keeta/Talabat/Deliveroo/Americana modules) was deleted in the 2026-07 PRD rebuild; their Prisma models remain in the schema (no destructive migrations), but the code surfaces are gone.

## Tech Stack

- **Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind + react-leaflet 4.2.1 (pinned) + TanStack Query
- **Backend:** Express 4 + TypeScript + Prisma 5 (PostgreSQL/Neon) + BullMQ (long-lived hosts only)
- **Mobile:** React Native / Expo 52 driver app (EN + AR, LTR layout by design)
- **Infra:** Vercel serverless (both apps), Docker Compose locally, cron-driven background work

## Surfaces (PRD §5)

| Surface | Where | Users |
|---|---|---|
| Ops / rider support | `/ops`, `/orders` + OrderOpsPanel | SUPERVISOR+ |
| Merchant portal | `/vendor/*` (orders, analytics, campaigns, wallet) | VENDOR role, fenced |
| Fleet portal | `/fleet-portal/*` (roster, scorecard, payouts) | FLEET role, fenced |
| Owner cockpit | `/cockpit` | ADMIN |
| Network config | `/zones`, `/pricing`, `/vendors`, `/fleets` | OPS_MANAGER+ |
| Customer tracking | `/track/[token]` — public, token is the credential | end customer |
| Driver app | `mobile/` (offers, POD PIN/photo, cash, SOS, points) | drivers |

## Key backend routes

- `/api/partner` — merchant order intake, API-key auth (`X-Api-Key`, sha256-hashed in ApiKey model), idempotent on externalRef. Key CRUD under `/api/vendors/:id/api-keys`.
- `/api/track/:token` — public tracking payload + `/rating` + `/tip` + `/cancel` (rate-limited; strict safe subset, never podPin/customerPhone).
- `/api/vendor` — vendor portal (JWT vendorId, vendorContainment fences VENDOR tokens).
- `/api/fleet` — fleet portal (JWT fleetPartnerId, fleetContainment); `/api/fleets` staff CRUD.
- `/api/cockpit/summary` — founder dashboard (ADMIN).
- `/api/wallets` — ledger, remittances, vendor statements, refunds processing.
- `/api/webhooks/foodics/:secret` + `/api/webhooks/twilio-whatsapp` — public inbound.
- `/api/cron/dispatch-sweep` + `/api/cron/daily` — Bearer CRON_SECRET, fail-closed. **Vercel Hobby only allows daily crons**, so dispatch needs an external minute-level ticker in production (see Deployment notes).

## Domain invariants (do not break)

- **Order FSM** (`orderStateMachine.ts`): every transition is a status-guarded `updateMany`; count 0 = lost race = 409. FAILED→RETURNED is the only exit from FAILED. Scheduled orders sit in CREATED until the cron sweep advances them.
- **Wallet** (`services/wallet/`): double-entry, append-only, idempotencyKey on every posting. Corrections are compensating transactions, never edits. Refunds never touch DRIVER_CASH. Tips: driver keeps 100% (CLEARING debit / DRIVER_CASH credit). Fleet payouts are computed from delivered-order counts, not accrual legs.
- **Dispatch** (`dispatch/dispatchEngine.ts`): serialized 15s offers, offerRound compare-and-set, radius auto-widens per round, auto-batching = one pickup multiple drops only (kill switch `FulfillmentSettings.batchingEnabled`); decline/expiry closes the whole batch; `releaseDriverToOnline` keeps batched drivers BUSY until the last active order ends. Throttled drivers (fleet discipline) rank last.
- **Containment:** VENDOR tokens only reach /api/auth + /api/vendor + /api/foodics + /api/events; FLEET only /api/auth + /api/fleet + /api/events.
- **Tenant scope:** every request wrapped by tenantScope; cross-tenant code is cron/webhook-internal only and marked with eslint-disable comments explaining why.

## Commands

```bash
docker-compose up -d                    # local stack (Postgres on :5433)
cd backend && npm run dev               # Express :8001
cd frontend && npm run dev              # Next.js :3000
cd backend && npm test                  # Jest suite
cd backend && npx tsx prisma/seed-darb2.ts   # Darb 2.0 seed (zones, vendor, fleet, couriers)
```

Seeded portal logins: `fleet@darb.demo / fleet1234` (FLEET). Vendor users are created from `/vendors/[id]`.

## Migrations (IMPORTANT)

`prisma migrate dev` DOES NOT WORK in this repo: the migration history predates a `db push` era and can never replay onto a shadow DB. The working pattern:

1. Edit `schema.prisma`. Enum values FIRST in their own migration (Postgres cannot use a new enum value in the transaction that adds it).
2. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_<name>/migration.sql`
3. `npx prisma db execute --file ... --url "$DATABASE_URL"` then `npx prisma migrate resolve --applied <name>` then `npx prisma generate`.
4. Prod applies pending migrations via `migrate deploy` on Vercel build; the datasource `directUrl = env("DATABASE_URL_UNPOOLED")` is what makes that work on Neon (the pooler silently breaks migrate). Verify with `prisma migrate status` against prod after deploying schema changes.

## Deployment notes

- Deploy: `vercel --prod --yes` from backend/ and frontend/ (node 20: `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`). After a frontend deploy: `vercel alias set <new-host> frontend-ebon-nine-34.vercel.app`.
- Backend prod env needs: DATABASE_URL, DATABASE_URL_UNPOOLED, CRON_SECRET, PUBLIC_TRACKING_BASE_URL, JWT secrets; TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM activate real WhatsApp (stub-warns until set).
- **Dispatch on Vercel Hobby:** vercel.json crons are daily only. `/api/cron/dispatch-sweep` must be hit every minute by an external ticker (cron-job.org or similar, `Authorization: Bearer $CRON_SECRET`) or offers expire only daily. Upgrading to Vercel Pro and setting the cron back to `* * * * *` is the clean fix.
- The BullMQ workers + in-process schedulers only run in the `app.listen` block (non-Vercel hosts); on Vercel the two cron endpoints are the only background drivers.

## Testing conventions

- House pattern: `getMockPrisma()` from `__tests__/setup.ts`, delegates attached per-suite, `jest.mock` at module boundaries, supertest for route auth boundaries.
- The suite has a set of intentionally-failing legacy/TDD-red suites (agent tools scaffolding, floor, finance legacy). The gate for new work is "no NEW failing suites", not zero failures. `agentRateLimit` and `locationIngest` flake under parallel load; they pass in isolation.

## Coding conventions

- TypeScript strict; Prisma for all DB access; money is Prisma.Decimal, serialized as 3dp strings (`toFixed(3)`).
- Routes: authMiddleware + tenantScope on the router, rbac() per route, try/catch → `{ error }`, getPagination/paginatedResponse.
- Frontend: Tailwind forest/sand tokens, rounded-pill, font-display; logical RTL props (`ms-`, `text-start`); money via formatKwd; ar + en both required for every new i18n key (typed Messages interface enforces it).
- The public tracking surface uses `lib/trackApi.ts` (plain fetch), NEVER the shared axios instance (its 401 interceptor redirects to /login).
- No em dashes in user-facing copy; `n/a` for empty table cells.
