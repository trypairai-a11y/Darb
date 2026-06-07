# Phase 7: Live Floor (Map + Pills + Courier Panel) — Research

**Researched:** 2026-05-13
**Domain:** Real-time geo-dashboard UX (map + filter pills + right-rail panel), tenant-scoped Server-Sent Events fan-out from a Redis pub/sub bus, react-leaflet + Next.js 14 App Router SSR-safe rendering, marker clustering at fleet scale (~50–300 couriers per tenant), reuse of Phase 4 streaming primitives and Phase 2 propose-and-confirm
**Confidence:** HIGH on transport (existing tenant-scoped Redis pub/sub `services/eventBus.ts` + SSE pattern in `routes/events.ts` already shipped); HIGH on data shape (CourierOnlineSession is the existing tenant-scoped snapshot table that Phase 5 is wiring fresh `lastGpsAt/Lat/Lng` onto); MEDIUM-HIGH on map library (react-leaflet@5 + react-leaflet-cluster@4.1.3 are installed but with a peer-dependency mismatch — see Pitfall 1); HIGH on action surface (Phase 2 `draftCourierMessage` + `/api/decisions/:id/approve` is the exact substrate the "Ping (WhatsApp)" button consumes)

## Summary

Phase 7 ships the **dispatcher's primary daily surface** at `/floor` — a live map of Kuwait that stays open all shift, shows every online courier as a coloured dot per CON-floor-dot-colors (green=working / grey=idle / red=GPS-stale / blue=scheduled-not-online) with a platform-colour tag, surfaces three top-of-screen pill counters per CON-floor-counters (Scheduled-not-online, GPS-stale >10 min, Order-rejection ×3+), and on dot-click opens a right-rail panel with phone/vehicle/current-order/last-GPS/today's-stats and a single "Ping (WhatsApp)" button.

The phase is best understood as **a thin frontend layer over substrate already in the codebase**, not a new system. Five existing things converge:

1. **The data source** — `CourierOnlineSession` (tenant-scoped, indexed `(tenantId, isOnline)`) already holds `lastGpsAt`, `lastGpsLat`, `lastGpsLng`, `area`, `isOnline` per online courier. Phase 5 is mid-execution and adds the upsert that keeps this table fresh from all four platforms (today only Keeta updates it). The Phase 7 map reads this table directly via a new `GET /api/floor/snapshot` and via the existing Phase 1 `liveFleetStatus` tool for the three pill-counter aggregates. `[VERIFIED: backend/prisma/schema.prisma:1744 + backend/src/agent/tools/read/liveFleetStatus.ts]`
2. **The transport** — `backend/src/services/eventBus.ts` already implements a tenant-scoped Redis pub/sub bus with an in-process fallback, and `backend/src/routes/events.ts` already exposes a SSE stream at `GET /api/events` with token-in-query-string auth, 30s heartbeats, per-tenant channel keying, and EventSource auto-reconnect. **Phase 7 reuses this verbatim** and only adds two new event types — `gps_point` and `online_session_update` — published whenever `POST /api/agent/location` writes a fresh GPS batch. No WebSocket. No third-party realtime service. The Phase 4 research already deferred the WebSocket question to Phase 7; the answer is "still don't need it, SSE+POST suffices." `[VERIFIED: backend/src/services/eventBus.ts + backend/src/routes/events.ts]`
3. **The map library** — `react-leaflet@5.0.0`, `react-leaflet-cluster@4.1.3`, `leaflet@1.9.4`, and `@types/leaflet@1.9.21` are already installed. One mini-map (`frontend/src/components/chat/views/MiniMapLeaflet.tsx`) already uses the `MapContainer`/`TileLayer`/`Marker` primitives behind `next/dynamic({ ssr: false })`. **Important caveat:** react-leaflet@5 declares `react@^19` as a peer dependency but the project ships React 18 — currently working only because npm's legacy peer-deps resolver lets it. Phase 7 must pin to react-leaflet@4.2.1 + react-leaflet-cluster@2.1.0 (which declare `react@^18`) OR explicitly accept the v5+legacy-peer-deps risk and document it (Pitfall 1). `[VERIFIED: npm view react-leaflet@5.0.0 peerDependencies + frontend/package.json]`
4. **The "Ping (WhatsApp)" action** — Phase 2 already shipped `draftCourierMessage` (the only Phase 2 live write tool) and the full propose-and-confirm flow at `/api/decisions/:id/approve` with audit-row writes to `AgentAction`. The Floor panel's Ping button calls the chat agent (Phase 4 SSE chat stream) with a fixed system prompt `"Draft a WhatsApp ping for driver {driverId} based on signal: {signal}"` — the registry stages a `PendingAgentAction`, the panel renders the same `<ChatActionCard/>` Phase 4 ships, and one Approve click fires the existing audited flow. **No new action tool, no new audit surface, no new approval gate.** `[VERIFIED: backend/src/agent/tools/action/draftCourierMessage.ts + backend/src/routes/decisions.ts]`
5. **The right-rail panel** — `frontend/src/components/shared/SlidePanel.tsx` already exists, is used by 5+ surfaces (decisions, tickets, talabat-orders, violations, americana), and gives us the exact UX shape we need. `frontend/src/components/shared/DriverLink.tsx` (Phase 3) gives the click-through to the canonical Driver File. `frontend/src/components/driver-file/AskDarbWhyDrawer.tsx` (Phase 3) is the reusable "Ask Darb Why" pattern for the GPS-stale / rejection-spike signals on the panel. `[VERIFIED: frontend/src/components/shared/SlidePanel.tsx + DriverLink.tsx + AskDarbWhyDrawer.tsx]`

**Primary recommendation:** Build Phase 7 as **(a) one new Express route file** (`backend/src/routes/floor.ts` exposing `GET /snapshot`, `GET /counters`, `POST /ping/:driverId`), **(b) one new SSE event publish hook** wired into `POST /api/agent/location` (so every mobile GPS batch publishes a `gps_point` event per driver to the tenant channel), **(c) one new frontend page** at `frontend/src/app/(dashboard)/floor/page.tsx` that dynamic-imports a `<LiveFloorMap/>` client component (ssr:false) using the existing react-leaflet primitives + `react-leaflet-cluster`, **(d) three filter-pill components** (StatusBadge-style) wired to a controlled filter state, **(e) one `<CourierDetailPanel/>`** component reusing `SlidePanel` + `DriverLink` + `AskDarbWhyDrawer` + `<ChatActionCard/>`. Critically: **defer the proposed `MobileGpsPoint` model entirely** — `LocationLog` (raw points) + `CourierOnlineSession` (live snapshot) is the actual schema today, the user-prompt's mention of `MobileGpsPoint` is inaccurate, and adding a third overlapping table would be premature normalization (Pitfall 2).

The phase is **smaller than it looks**. Most of the perceived surface area is reused substrate. The single load-bearing new decision is whether to keep react-leaflet at v5 + lockfile-override the peer-dep mismatch, or pin down to v4.2.1 + cluster@2.1.0 — both are defensible; Pitfall 1 documents the tradeoff and recommends v4 for stability.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live courier snapshot read (initial map state) | Backend `GET /api/floor/snapshot` (NEW thin route) | DB query on `CourierOnlineSession` joined with `Driver` | One denormalised tenant-scoped read; uses existing `(tenantId, isOnline)` index |
| Three pill-counter aggregates | Backend (call existing `liveFleetStatus` tool — Phase 1) | DB query already implemented | Re-use; no new code. Counters are `totalOnline`, `gpsStaleCount`, `scheduledNotOnlineCount`. Adds one new sub-count `orderRejectionCount` (new Phase 7 column or query) |
| Real-time GPS updates push | Backend `eventBus.publishEvent({type: "gps_point", tenantId, payload})` from inside `POST /api/agent/location` | Redis pub/sub (existing) | One-line wire-in inside the existing route. No new transport layer. |
| SSE delivery to browser | Backend (existing `GET /api/events` route — already shipped) | EventSource API (existing `useSSE` hook) | Zero new transport code. The route already broadcasts every tenant-scoped event to subscribed dispatchers. |
| Filter state (platform multi-select, status, area, search) | Frontend (React state + URLSearchParams sync) | — | Pure client; filter applies to the in-memory courier list, not a server round-trip |
| Map rendering | Frontend `<LiveFloorMap/>` ("use client") dynamic-imported with `ssr: false` | `react-leaflet` + `react-leaflet-cluster` + OpenStreetMap tiles | Lazy-load is mandatory — Leaflet calls `window` at import time. Same pattern as existing `MiniMapView.tsx` |
| Marker clustering | Frontend `<MarkerClusterGroup chunkedLoading disableClusteringAtZoom={16} maxClusterRadius={40} />` | `leaflet.markercluster@1.5.3` (transitive) | Per `leaflet.markercluster` docs, chunkedLoading keeps the page responsive when adding many markers in one go [CITED: github.com/leaflet/leaflet.markercluster README]. At 300 couriers we don't strictly need it; we add it because the Floor will eventually show platform-coloured platform-tagged dots and clustering keeps the dispatcher's eye on density |
| Marker icon (coloured dot + platform tag) | Frontend `L.divIcon({html: '<div class="floor-dot ...">'})` per courier | Tailwind classes | DivIcon is the documented Leaflet pattern for custom HTML markers; no canvas, no PNG — keeps everything inspectable and theme-coloured via Tailwind tokens (`bg-keeta`, `bg-talabat`, `bg-deliveroo`, `bg-americana` already exist in `tailwind.config.ts`) `[VERIFIED: frontend/tailwind.config.ts:61-64]` |
| Stale-GPS classification (>10 min) | Backend (read tool already classifies, freshness comes from `lastGpsAt`) + Frontend (visual colour) | — | Backend ships `gpsStaleCount` aggregate; frontend computes per-marker `isStale = Date.now() - lastGpsAt > 10*60_000` for colour. Threshold is hard-coded by CON-floor-counters (10 min); deliberately not configurable per Phase 7. |
| Right-rail panel | Frontend `<CourierDetailPanel/>` reusing existing `SlidePanel` | — | The SlidePanel component already lives at `frontend/src/components/shared/SlidePanel.tsx` and is reused by 5+ surfaces |
| Driver File click-through | Frontend `<DriverLink/>` (Phase 3) | — | Existing primitive — every driver name is clickable to `/drivers/[id]` |
| "Ask Darb why?" on signals | Frontend `<AskDarbWhyDrawer/>` (Phase 3) | Existing endpoint `/api/drivers/:id/score-explanation` | Reuse the Phase 3 drawer for the three pill signals; no new endpoint |
| "Ping (WhatsApp)" button → draft + send | Frontend triggers chat agent via Phase 4 `/api/ai/chat/stream` (or a thinner `POST /api/floor/ping/:driverId`) → backend stages `PendingAgentAction` via existing `draftCourierMessage` tool | Phase 2 `/api/decisions/:id/approve` finalises the send | Reuses the entire Phase 2 propose-and-confirm stack. No new audit row shape, no new approval gate. |
| RBAC | Backend `rbac("OPS_MANAGER", "ADMIN", "SUPERVISOR")` on `/api/floor/*` | Existing `authMiddleware + tenantScope` | OPS_MANAGER lands on `/floor` per DEC-role-based-landing |
| Search by name / id | Frontend (client-side `Array.filter` over loaded couriers) | — | At ≤500 couriers per tenant client-side search is fine; avoids a server round-trip per keystroke |

## Standard Stack

### Core (already installed — verify versions, do not introduce alternatives)

| Library | Version (installed) | Verified | Purpose | Why Standard |
|---------|---------------------|----------|---------|--------------|
| `react-leaflet` | `5.0.0` installed; **recommend pinning to `4.2.1`** | `[VERIFIED: cat node_modules/react-leaflet/package.json → 5.0.0; npm view react-leaflet@4.2.1 peerDependencies → {react: ^18.0.0, leaflet: ^1.9.0}]` | React bindings for Leaflet | Already in repo; v4.2.1 is the React-18-compatible line. v5.0.0 requires React 19 [VERIFIED: npm peerDeps]. See Pitfall 1. |
| `react-leaflet-cluster` | `4.1.3` installed; **recommend pinning to `2.1.0`** | `[VERIFIED: node_modules/react-leaflet-cluster/package.json → 4.1.3 with peerDep react@^19; npm view react-leaflet-cluster@2.1.0 peerDependencies → {react: ^18.0.0, react-leaflet: ^4.0.0}]` | MarkerClusterGroup React wrapper around `leaflet.markercluster` | Same React 18 alignment story as react-leaflet. v2.1.0 is the matching v4 sibling |
| `leaflet` | `1.9.4` | `[VERIFIED: npm view leaflet version → 1.9.4]` | Core Leaflet library | Standard; both v4 and v5 of react-leaflet require `leaflet ^1.9.0` |
| `leaflet.markercluster` | `1.5.3` (transitive via react-leaflet-cluster) | `[VERIFIED: npm view leaflet.markercluster version → 1.5.3]` | Clustering algorithm + spiderfy | Industry-standard for ≤10k markers per documented benchmarks; chunkedLoading keeps page responsive [CITED: github.com/Leaflet/Leaflet.markercluster README] |
| `@types/leaflet` | `1.9.21` | `[VERIFIED: frontend/package.json]` | TypeScript types | Required for typed icon/divIcon construction |
| `next` | `14.2.35` | `[VERIFIED: frontend/package.json]` | App Router for `/floor` page | Existing; `next/dynamic` is the canonical SSR-skip primitive for Leaflet |
| `react` / `react-dom` | `^18` | `[VERIFIED: frontend/package.json]` | UI runtime | Pin determines react-leaflet major version (Pitfall 1) |
| `@tanstack/react-query` | `^5.99.0` | `[VERIFIED: frontend/package.json]` | Initial `/api/floor/snapshot` fetch + cache for filter dropdown lookups (areas, platforms) | Already used by Phase 4 for thread lists, Phase 3 for `useApi` — same idiom |
| `cmdk` | `^1.1.1` | `[VERIFIED: frontend/package.json]` | Search input within the right-rail courier list | Phase 4 already adopted; reuse for in-Floor "search courier by name" if a list view is added (out of scope for Phase 7 MVP; flag for follow-up) |
| `lucide-react` | `^0.577.0` | `[VERIFIED: frontend/package.json]` | Icons (MessageSquare, Phone, MapPin, Battery, Clock, X) | Existing |

### Core (backend — already installed, no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ioredis` | `^5.4.1` | Redis pub/sub for `eventBus` | Existing — used by `services/eventBus.ts`, BullMQ, 8 workers |
| `@prisma/client` | `^5.22.0` | DB reads on `CourierOnlineSession`, `Driver`, `Shift`, `Order` (or `OrderLog`) | Existing |
| `zod` | `^3.23.8` | Input validation on `POST /api/floor/ping/:driverId` | Existing pattern in `defineTool` and route handlers |
| `pino` | (existing via `config/logger.ts`) | Structured logs | Existing |
| `jsonwebtoken` | (existing) | Token-in-query SSE auth (already implemented in `routes/events.ts:sseAuth`) | Existing — reuse verbatim |

### Alternatives Considered (load-bearing decisions)

| Decision Point | Chosen | Alternative | Tradeoff |
|----------------|--------|-------------|----------|
| Transport: SSE vs WebSocket for live map | **SSE (reuse `routes/events.ts` + `services/eventBus.ts`)** | WebSocket (`ws`, `socket.io`, Ably, Pusher) | Live floor needs server→client push (GPS, online-session updates, pill-counter recalculations) and one occasional client→server action (Ping). SSE handles the push side natively; the action is a plain HTTP POST. **The Phase 4 research explicitly deferred the WebSocket question to Phase 7; the answer is still SSE.** Vercel functions on Pro plan default to 300s, configurable to 800s with Fluid Compute [CITED: vercel.com/docs/functions/configuring-functions/duration]. With 30s heartbeats and EventSource auto-reconnect, a 300s timeout means each connection reconnects ~12 times per hour — acceptable, transparent. The Redis pub/sub bus handles fan-out across reconnects. WebSocket on Vercel still requires a separate always-on backend (Render / Railway) or a paid third-party service — not justified for a 1-engineer pivot. |
| Polling vs streaming | **Streaming (SSE) for GPS deltas + 30s polling fallback for pill counters via `react-query` `refetchInterval`** | Pure polling at 10s | Polling at 10s with 50–300 couriers per tenant works but burns serverless invocations and feels laggy on the map. Streaming the GPS deltas keeps marker movement smooth; polling the counters (which aggregate cross-tenant SQL) every 30s with `staleTime: 25s` is cheaper than recomputing them per-event |
| Data shape: query `CourierOnlineSession` vs build a new `MobileGpsPoint` table | **`CourierOnlineSession` (existing, tenant-scoped, indexed) + `LocationLog` (existing, raw history)** | New `MobileGpsPoint` denormalised table | The user prompt mentioned `MobileGpsPoint` but no such table exists or is being added in Phase 5; Phase 5's plan explicitly extends `POST /api/agent/location` to upsert `CourierOnlineSession.lastGpsAt/Lat/Lng` per driver. Adding a third overlapping table is premature normalization — `CourierOnlineSession` already gives us the exact shape Phase 7 needs (lat, lng, lastGpsAt, area, isOnline) with a tenant-scoped index. `LocationLog` remains the historical store for `gpsTrack` queries. `[VERIFIED: backend/prisma/schema.prisma:1744 + .planning/phases/05-mobile-gps-beacon/05-02-PLAN.md]` |
| Map library: react-leaflet vs alternatives | **react-leaflet (already installed)** | Mapbox GL JS, Maptiler SDK, Google Maps, deck.gl | All four alternatives require an API key + monthly cost (Mapbox $0.50/1k loads after 50k free, Google $7/1k loads). react-leaflet + OSM tiles is free. The dispatcher needs a glanceable 2D map with markers — no 3D, no vector tiles, no heat maps. react-leaflet is sufficient and already in the codebase. |
| React 18 vs react-leaflet@5 | **Pin to react-leaflet@4.2.1 + react-leaflet-cluster@2.1.0** | Keep v5/v4.1.3 with `--legacy-peer-deps` | v5 declares `react@^19` peerDep; current install only works under legacy resolver. v4.2.1 declares `react@^18` and is the stable choice for a React-18 project. The downgrade is a `package.json` edit + `npm install` + smoke test. **Recommended.** See Pitfall 1. |
| Clustering library: leaflet.markercluster vs supercluster | **leaflet.markercluster (via react-leaflet-cluster)** | supercluster (Mapbox-style WebWorker clustering) | supercluster outperforms markercluster at 100k+ markers [CITED: github.com/AndrejGajdos/leaflet-markercluster-vs-supercluster] but we're at 50–300 markers per tenant. markercluster handles 10k+ in Chrome with `chunkedLoading` [CITED: leaflet.markercluster README]. supercluster adds a WebWorker dependency for zero practical benefit at our scale. |
| Marker rendering: DOM vs Canvas | **DOM (default Leaflet rendering)** | `Leaflet.Canvas-Markers` plugin | Canvas markers are faster but harder to style (no Tailwind classes, no hover state, no click event bubbling). At 50–300 markers DOM is fine; clustering hides distant ones anyway. Re-evaluate only if a tenant pushes past 1000 concurrent couriers (very unlikely in v1). |
| Pill counters: compute server-side vs client-side | **Server-side via `liveFleetStatus` tool (Phase 1)** | Client computes from the snapshot payload | The tool already computes `gpsStaleCount`, `scheduledNotOnlineCount`. Adding a client-side derivation duplicates the logic and risks drift. One source of truth. The pill click-through filter is client-side (filter the loaded markers); the counter itself is server-authoritative. |
| Order-rejection ×3+ counter | **NEW backend computation in the Phase 7 read tool extension** | Client compute from rejection events | No existing aggregate. Phase 7 must either (a) extend `liveFleetStatus` to add `orderRejectionCount` (counts drivers where today's `Order`/`OrderLog`/`OrderEvent` shows ≥3 rejection events) or (b) add a new tool `orderRejectionToday` that returns `[{driverId, count}]`. Recommendation: (a) for the counter, (b) is implied by the pill filter (clicking the pill needs the list). |
| "Ping (WhatsApp)" backend wiring | **Reuse `draftCourierMessage` + `POST /api/decisions/:id/approve`** | New floor-specific action tool | Phase 2's `draftCourierMessage` already takes `intent ∈ {WARN_LATE_CLOCKIN, WARN_GPS_STALE, WARN_ORDER_REJECTIONS, ...}` — these are exactly the three pill signals. Reuse is mandatory by CON-action-confirm-card + CON-audit-row-shape. The Floor's Ping button posts `{driverId, intent: "WARN_GPS_STALE", bodyEnglish: <draft>}` through the existing chat agent or a thin `POST /api/floor/ping/:driverId` route that invokes the tool with `requiresApproval: true` — staging happens identically. |
| Filter state persistence | **URLSearchParams (`?platforms=KEETA,TALABAT&status=stale&area=Hawally`)** | localStorage | URL sync allows dispatchers to share a filtered view via link ("look at Hawally GPS-stale right now"); copy-paste-able. localStorage is per-browser, opaque. |

**Installation (zero new packages required if downgrading):**

```bash
cd frontend && npm install react-leaflet@4.2.1 react-leaflet-cluster@2.1.0
# OR (if keeping v5 + legacy-peer-deps): no install needed, but document the override.
```

**Version verification:**
```bash
npm view react-leaflet@4.2.1 version time --json
npm view react-leaflet-cluster@2.1.0 version time --json
npm view leaflet@1.9.4 version time --json
npm view leaflet.markercluster@1.5.3 version time --json
```
[CITED: npm-registry — all four packages verified live during research; react-leaflet@4.2.1 published 2024-01-19, last in the v4 line]

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                  CLIENT (Browser)                                  │
│                                                                                    │
│  /floor (Next.js App Router page)                                                  │
│  ├─ Server Component shell (Just the page wrapper + auth check)                    │
│  └─ <LiveFloorPage/> ("use client") — the actual map UI                            │
│      │                                                                             │
│      ├─ initial GET /api/floor/snapshot  (react-query useQuery, staleTime 30s)     │
│      │     → returns [{driverId, name, platform, lat, lng, lastGpsAt,              │
│      │                 area, isOnline, currentOrderId?, todayStats}]               │
│      │                                                                             │
│      ├─ EventSource(/api/events?token=<jwt>)  (useSSE existing hook)               │
│      │     ← receives "gps_point" / "online_session_update" events;                │
│      │     each event updates one courier's marker position via setState           │
│      │                                                                             │
│      ├─ GET /api/floor/counters  (react-query refetchInterval 30s)                 │
│      │     → returns { scheduledNotOnline: N, gpsStale: N, orderRejection: N }     │
│      │                                                                             │
│      ├─ <FloorPillCounters/>                                                       │
│      │     │ three clickable pill badges; clicking sets filter.status              │
│      │                                                                             │
│      ├─ <FloorFilters/>                                                            │
│      │     │ platform multi-select, area dropdown, search input — URLSearchParams  │
│      │                                                                             │
│      ├─ <LiveFloorMap/>  ← dynamic(() => import("./LiveFloorMap"), { ssr: false }) │
│      │     │ react-leaflet <MapContainer center={[29.3759, 47.9774]} zoom={11}>    │
│      │     │   <TileLayer url="osm" />                                             │
│      │     │   <MarkerClusterGroup chunkedLoading                                  │
│      │     │                       maxClusterRadius={40}                           │
│      │     │                       disableClusteringAtZoom={16}>                   │
│      │     │     {filteredCouriers.map(c => <CourierMarker {...c} />)}             │
│      │     │   </MarkerClusterGroup>                                               │
│      │     └ each <CourierMarker/> uses L.divIcon with                             │
│      │       dot-color × platform-tag classes (Tailwind tokens)                    │
│      │                                                                             │
│      └─ <CourierDetailPanel/>  ← reuses <SlidePanel/> from Phase 2                 │
│           │ opens on marker click; holds:                                          │
│           │   - Header: <DriverLink/> (Phase 3) + platform badge                   │
│           │   - Stats row: online hours, completed orders, score chip              │
│           │   - <AskDarbWhyDrawer/> (Phase 3) for the active signal                │
│           │   - Last GPS map mini-strip (lat,lng,age)                              │
│           │   - <PingButton/>                                                      │
│           │       → POST /api/floor/ping/:driverId { intent }                      │
│           │       ← returns { pendingActionId }                                    │
│           │   - <ChatActionCard/> (Phase 4) shown when pending; Approve            │
│           │       hits POST /api/decisions/:id/approve (Phase 2)                   │
└────────────────────────────────────────────────────────────────────────────────────┘
                            │ HTTP (axios) + EventSource (SSE)
                            ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express + Prisma + Redis)                          │
│                                                                                    │
│  routes/floor.ts (NEW)                                                             │
│    GET  /snapshot   ← authMiddleware → tenantScope → rbac(OPS_MGR/ADMIN/SUP)       │
│        SELECT cs.*, d.name, d.platform, d.phone, d.vehicleType, d.zone             │
│        FROM CourierOnlineSession cs JOIN Driver d                                  │
│        WHERE cs.tenantId=$tenant AND cs.isOnline=true                              │
│        (~one indexed query, single ROUND TRIP)                                     │
│                                                                                    │
│    GET  /counters   ← reuses Phase 1 liveFleetStatus tool + new orderRejection     │
│        const fleet = await liveFleetStatus.execute({tenantId});                    │
│        const rej = await countDriversWithRejectionsToday(tenantId);                │
│        return { ...fleet, orderRejectionCount: rej };                              │
│                                                                                    │
│    POST /ping/:driverId   ← invokes draftCourierMessage via toolRegistry           │
│        const result = await toolRegistry.invoke("draftCourierMessage",             │
│          { tenantId, userId: undefined /* propose only */, agentId: "floor" },    │
│          { driverId, intent, bodyEnglish });                                       │
│        // requiresApproval=true → stages PendingAgentAction                        │
│        return { pendingActionId: result.pendingActionId };                         │
│                                                                                    │
│  routes/events.ts (EXISTING — unchanged)                                           │
│    GET /                ← SSE stream, per-tenant channel via eventBus.subscribe    │
│                                                                                    │
│  routes/agent.ts (EXISTING — one-line change)                                      │
│    POST /location  ← unchanged behaviour PLUS at end:                              │
│        publishEvent({                                                              │
│          type: "gps_point",                                                        │
│          tenantId,                                                                 │
│          payload: { driverId, lat, lng, capturedAt, isStale: false }               │
│        });                                                                         │
│        if (sessionCreatedOrUpdated)                                                │
│          publishEvent({                                                            │
│            type: "online_session_update",                                          │
│            tenantId,                                                               │
│            payload: { driverId, isOnline, area }                                   │
│          });                                                                       │
│                                                                                    │
│  services/eventBus.ts (EXISTING — extend the union type)                           │
│    type DarbEventType = ... | "gps_point" | "online_session_update"                │
│                                                                                    │
│  agent/tools/read/liveFleetStatus.ts (EXTEND)                                      │
│    Add orderRejectionCount aggregate to the existing return shape                  │
│                                                                                    │
│  agent/tools/read/floorCourierList.ts (NEW — optional thin tool)                   │
│    Returns the same shape as GET /api/floor/snapshot for chat agent reuse          │
│    ("show me all stale couriers in Hawally" → renders the floor view inline)       │
└────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                PostgreSQL 15 + Redis 7                             │
│                                                                                    │
│  CourierOnlineSession  ← Phase 5 keeps this fresh (tenant-scoped, indexed)         │
│  Driver, Shift, Order (or OrderLog), Notification, PendingAgentAction, AgentAction │
│  (no new tables added by Phase 7 — verified)                                       │
│                                                                                    │
│  Redis channel: events:{tenantId}  ← already in use by alert/violation events      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
backend/src/
├── routes/
│   ├── events.ts                   # EXISTING — SSE stream, reused verbatim
│   ├── agent.ts                    # EXISTING — extend POST /location with publishEvent
│   ├── decisions.ts                # EXISTING — Phase 2 approve route (no change)
│   └── floor.ts                    # NEW — /snapshot, /counters, /ping/:driverId
├── services/
│   └── eventBus.ts                 # EXISTING — extend DarbEventType union
└── agent/tools/read/
    ├── liveFleetStatus.ts          # EXTEND — add orderRejectionCount
    └── floorCourierList.ts         # OPTIONAL NEW — chat reuses the floor view

frontend/src/app/(dashboard)/
└── floor/
    ├── page.tsx                    # NEW — server component shell
    └── components/                 # OR live under src/components/floor/
        ├── LiveFloorPage.tsx       # NEW "use client" — orchestrates filters + map + panel
        ├── LiveFloorMap.tsx        # NEW "use client" — react-leaflet primitives
        ├── FloorPillCounters.tsx   # NEW — three clickable pill badges
        ├── FloorFilters.tsx        # NEW — platform / status / area / search
        ├── CourierMarker.tsx       # NEW — L.divIcon factory + tooltip
        └── CourierDetailPanel.tsx  # NEW — reuses SlidePanel + DriverLink + AskDarbWhyDrawer + ChatActionCard

frontend/src/hooks/
├── useSSE.ts                       # EXISTING — reused verbatim
└── useFloorRealtime.ts             # NEW — composes useSSE + react-query state
```

### Pattern 1: SSR-safe Leaflet via `next/dynamic`
**What:** Leaflet calls `window` at module-import time; rendering on the server crashes with `ReferenceError: window is not defined`.
**When to use:** Every component that imports anything from `react-leaflet`, `leaflet`, or `react-leaflet-cluster`.
**Example:**
```typescript
// frontend/src/app/(dashboard)/floor/page.tsx
import dynamic from "next/dynamic";

const LiveFloorMap = dynamic(
  () => import("@/components/floor/LiveFloorMap").then(m => m.LiveFloorMap),
  { ssr: false, loading: () => <FloorMapSkeleton /> }
);
// Source: Phase 4 existing pattern in frontend/src/components/chat/views/MiniMapView.tsx:10
// [CITED: react-leaflet.js.org/docs/start-introduction — "Server-side rendering is not supported"]
```

### Pattern 2: Reuse the existing eventBus for `gps_point` events
**What:** A one-line publish call inside the existing `POST /api/agent/location` route fans GPS updates out to every connected dispatcher's SSE stream.
**When to use:** Anywhere a courier's live state changes (GPS, online/offline, area assignment).
**Example:**
```typescript
// backend/src/routes/agent.ts — inside POST /location, after the existing prisma.locationLog.createMany:
import { publishEvent } from "../services/eventBus";

const last = locations[locations.length - 1];
const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { tenantId: true } });
if (driver) {
  publishEvent({
    type: "gps_point",
    tenantId: driver.tenantId,
    payload: { driverId, lat: last.latitude, lng: last.longitude, capturedAt: last.capturedAt },
    timestamp: new Date().toISOString(),
  });
}
// Source: backend/src/services/eventBus.ts (existing)
```

### Pattern 3: Tenant-scoped SSE auth via token-in-query
**What:** EventSource doesn't support Authorization headers; the existing `routes/events.ts` accepts `?token=<jwt>` and verifies it.
**Example:**
```typescript
// frontend — hook usage
const { lastEvent } = useSSE({
  url: "/api/events",  // useSSE adds ?token=<accessToken> automatically
  onMessage: (e) => {
    if (e.type === "gps_point") updateMarker(e.payload);
    if (e.type === "online_session_update") refreshCounters();
  },
});
// Source: frontend/src/hooks/useSSE.ts:24-28 (existing)
```

### Pattern 4: Pill counter from `liveFleetStatus` (no new aggregate code needed for two of three)
**What:** Two of the three pills are already computed by the Phase 1 read tool.
**Example:**
```typescript
// backend/src/routes/floor.ts — GET /counters
const fleet = await toolRegistry.invoke(
  "liveFleetStatus",
  { tenantId: req.user!.tenantId, agentId: "floor", runId: "n/a", userId: req.user!.id },
  {}
);
const orderRejectionCount = await countDriversWithRejectionsToday(req.user!.tenantId);
return res.json({
  scheduledNotOnline: fleet.scheduledNotOnlineCount,
  gpsStale: fleet.gpsStaleCount,
  orderRejection: orderRejectionCount,
});
// Source: backend/src/agent/tools/read/liveFleetStatus.ts (existing, Phase 1)
```

### Pattern 5: Ping (WhatsApp) via existing `draftCourierMessage` + Phase 2 approve flow
**What:** Reuse the audited propose-and-confirm substrate; no new write path.
**Example:**
```typescript
// backend/src/routes/floor.ts — POST /ping/:driverId
const { driverId } = req.params;
const { intent, bodyEnglish } = req.body;  // intent = WARN_GPS_STALE | WARN_ORDER_REJECTIONS | WARN_LATE_CLOCKIN
const result = await toolRegistry.invoke(
  "draftCourierMessage",
  { tenantId: req.user!.tenantId, agentId: "floor", runId: req.id, userId: undefined /* stage */ },
  { driverId, intent, bodyEnglish, channel: "WHATSAPP" }
);
// requiresApproval=true → registry returns { status: "pending_approval", pendingActionId }
return res.json({ pendingActionId: result.pendingActionId });

// Frontend then renders <ChatActionCard pendingActionId={...} /> from Phase 4 verbatim;
// clicking Approve hits POST /api/decisions/:id/approve which fires the existing audited path.
// Source: backend/src/agent/tools/action/draftCourierMessage.ts (Phase 2)
```

### Pattern 6: Marker clustering at fleet scale
**What:** Configure `MarkerClusterGroup` to render efficiently at 50–300 markers and remain responsive when GPS deltas update positions.
**Example:**
```typescript
// frontend/src/components/floor/LiveFloorMap.tsx
import MarkerClusterGroup from "react-leaflet-cluster";

<MarkerClusterGroup
  chunkedLoading                    // process addLayers in chunks to avoid main-thread block
  chunkInterval={200}               // default
  chunkDelay={50}                   // default
  maxClusterRadius={40}             // tighter clustering than default (80) — Kuwait City fits in a smaller frame
  disableClusteringAtZoom={16}      // at zoom 16+ each courier shows individually
  removeOutsideVisibleBounds={true} // perf: cull markers outside viewport
  spiderfyOnMaxZoom={true}          // when overlapping at max zoom, spread them
  animate={false}                   // disable animation for bulk position updates (per markercluster docs, big perf win)
>
  {filteredCouriers.map(c => <CourierMarker key={c.id} courier={c} />)}
</MarkerClusterGroup>
// [CITED: github.com/leaflet/leaflet.markercluster/blob/master/README.md — chunkedLoading, animate option]
```

### Pattern 7: Custom `divIcon` for platform-coloured dot
**What:** Render the marker as a Tailwind-classed HTML element so the dot colour (status) and ring colour (platform) reuse the design tokens already in `tailwind.config.ts`.
**Example:**
```typescript
// frontend/src/components/floor/CourierMarker.tsx
import L from "leaflet";

const statusBg: Record<CourierStatus, string> = {
  WORKING: "bg-emerald-500",
  IDLE: "bg-sand-400",
  STALE: "bg-red-500",
  SCHEDULED_NOT_ONLINE: "bg-blue-500",
};
const platformRing: Record<Platform, string> = {
  KEETA: "ring-keeta",
  TALABAT: "ring-talabat",
  DELIVEROO: "ring-deliveroo",
  AMERICANA: "ring-americana",
};

const icon = L.divIcon({
  html: `<div class="floor-dot ${statusBg[c.status]} ${platformRing[c.platform]} ring-2 ring-offset-1 rounded-full w-3.5 h-3.5"></div>`,
  className: "",  // suppress default Leaflet styles
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
// Source: tailwind tokens already defined at frontend/tailwind.config.ts:61-64
```

### Anti-Patterns to Avoid
- **Anti-pattern: Polling `/api/floor/snapshot` every 2 seconds.** Burns serverless invocations and feels sluggish. Use SSE for deltas.
- **Anti-pattern: Storing all 300 couriers' positions in React state and re-rendering every marker on each GPS event.** Use a stable courier dict keyed by `driverId` and let React reconciliation only update the affected marker. Or push to a ref + force a single re-render of the affected marker.
- **Anti-pattern: Adding a new `MobileGpsPoint` model.** Premature normalization. `CourierOnlineSession` + `LocationLog` is the existing schema. Phase 7 adds no tables. (See Pitfall 2.)
- **Anti-pattern: Computing `isStale` server-side per-event.** Stale-ness is a function of "now" — let the client decide colour from `lastGpsAt`. The server's `gpsStaleCount` aggregate is a separate counter computed every 30s.
- **Anti-pattern: Adding a brand-new "Ping" action tool.** Reuse `draftCourierMessage`. Anything that fires a courier-facing message must go through the existing Phase 2 audited propose-and-confirm path.
- **Anti-pattern: Building a bespoke right-rail panel from scratch.** `SlidePanel` already exists and is used by 5+ surfaces.
- **Anti-pattern: Putting the map inside a Next.js Server Component.** Crashes on import. Always lazy-load via `next/dynamic({ ssr: false })`.
- **Anti-pattern: WebSocket "just because the PRD said WebSocket".** PRD `CON-realtime-protocols` literally says "Add WebSocket for live floor map subscriptions" — but the actual data flow is server→client push, which SSE handles. Phase 4 research already documented this re-interpretation; surface to the user during `/gsd-discuss-phase` if the team wants to lock it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Realtime push to many dispatchers | Custom long-polling, WebSocket server, third-party realtime service | Existing `services/eventBus.ts` + `routes/events.ts` SSE | Already shipped, tenant-scoped, has Redis pub/sub + in-process fallback, EventSource auto-reconnects in browser |
| Tenant-scoped channel auth | Custom token cookie scheme | Existing `sseAuth` middleware (`routes/events.ts:14`) | Already accepts JWT in `?token=` query (EventSource limitation) |
| Marker clustering | Custom k-means / hand-rolled bucketing | `react-leaflet-cluster` + `leaflet.markercluster` | 10k+ markers in Chrome with chunkedLoading [CITED: leaflet.markercluster README]; we have ≤300 |
| Right-rail slide panel | Custom drawer component | Existing `frontend/src/components/shared/SlidePanel.tsx` | Used by decisions, tickets, talabat-orders, violations, americana — five-call-site reuse |
| Driver name → file link | Custom Link wrappers | Existing `frontend/src/components/shared/DriverLink.tsx` (Phase 3) | Single source of truth for /drivers/[id] routing |
| "Why is this courier stale?" explanation | New endpoint | Existing `AskDarbWhyDrawer` + `/api/drivers/:id/score-explanation` (Phase 3) | Drawer is already wired; just pass `driverId` + a signal-specific intent |
| Propose-and-confirm for the Ping action | New audit row shape, new approval flow | `draftCourierMessage` (Phase 2 tool) + `/api/decisions/:id/approve` (Phase 2 route) | Mandatory by CON-action-confirm-card + CON-audit-row-shape — every write action goes through the existing audited path |
| Pill-counter aggregates | Bespoke SQL | `liveFleetStatus` tool (Phase 1) + `agent/tools/read/courierLeaderboard.ts` patterns | Already tenant-scoped, indexed, mocked in tests; reuse |
| GPS history queries | Bespoke queries on LocationLog | `gpsTrack` tool (Phase 1) | Already supports ranged reads with tenant boundary via Driver pre-check |
| SSE reconnection logic | Custom retry loops | Existing `frontend/src/hooks/useSSE.ts` | Already implements exponential backoff to 30s, withCredentials, token-in-query |
| Tile provider | A new map service | OpenStreetMap tiles via TileLayer (free, no API key) | Already in use in `MiniMapLeaflet.tsx` |
| Search-by-name | Backend search route | Client-side `Array.filter` over loaded couriers | At ≤500 couriers per tenant, client filter is instant and free |

**Key insight:** Phase 7 is **substrate composition, not new construction.** The bulk of every requested capability — SSE, tenant scope, Redis fan-out, propose-and-confirm, audit log, driver-link primitive, slide panel, score chip, leaflet rendering, ask-darb-why drawer — already exists from Phases 1–6. The only genuinely new code is one Express route file, one frontend page, one map component, one filter bar, one panel composition, and an extension of one read tool. **Resist the temptation to introduce new abstractions.**

## Runtime State Inventory

This phase introduces a frontend-facing surface but does not rename, refactor, or migrate any existing state. Inventory included for completeness — most categories are empty by design.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None new. Phase 7 reads `CourierOnlineSession` (existing, populated by Phase 5) and `LocationLog` (existing). | None — Phase 5 owns the writes |
| Live service config | None. The `/api/floor/*` routes register identically to all existing `/api/*` routes in `backend/src/server.ts`. | One-line addition to `server.ts`: `app.use("/api/floor", floorRoutes);` |
| OS-registered state | None. No new BullMQ workers, no scheduled jobs, no foreground services. | — |
| Secrets / env vars | None new. SSE auth reuses the existing `JWT_SECRET`. | — |
| Build artifacts | If react-leaflet is downgraded from v5 → v4.2.1 (recommended), `package-lock.json` regenerates and node_modules will need a fresh install. Vercel's build cache should self-heal on next deploy. | Run `cd frontend && rm -rf node_modules .next && npm install` once after the downgrade; verify `npm run build` succeeds. |

## Common Pitfalls

### Pitfall 1: react-leaflet@5 + React 18 peer-dependency mismatch
**What goes wrong:** `react-leaflet@5.0.0` declares `react@^19.0.0` as a peer dependency [VERIFIED: `npm view react-leaflet@5.0.0 peerDependencies`], but the project ships `react@^18`. The current install only works because npm's legacy peer-deps resolver (which became the default in npm 7+) accepts the mismatch silently. The same is true of `react-leaflet-cluster@4.1.3`, which depends on `react-leaflet@^5.0.0`. Phase 7 builds the load-bearing map surface; a future React or react-leaflet patch could break this silently in CI.
**Why it happens:** react-leaflet@5 was released in Q1 2025 expecting React 19 to be the production default; the project remains on React 18 because Next.js 14 is React-18-pinned.
**How to avoid:** Pin `react-leaflet@4.2.1` (last v4 release, [VERIFIED: published 2024-01-19, peerDeps `{react: ^18.0.0, leaflet: ^1.9.0}`]) and `react-leaflet-cluster@2.1.0` (matching v4 sibling with `react-leaflet: ^4.0.0` peerDep). The downgrade is a `package.json` edit + `npm install`; the existing `MiniMapLeaflet.tsx` uses only v4-compatible APIs (`MapContainer`, `TileLayer`, `Marker`, `Popup`) — no migration cost. **Recommended: downgrade in the same wave that introduces the Floor map.**
**Alternative:** Keep v5/v4.1.3 and document the peer-dep override + add an explicit `engines.react` constraint. Riskier; not recommended.
**Warning signs:** Build-time `ERESOLVE` warnings; `npm ls react-leaflet` shows "invalid"; tests pass locally but Vercel builds with a fresh cache occasionally fail or behave differently.
[CITED: npm view react-leaflet@5.0.0 peerDependencies; npm view react-leaflet@4.2.1 peerDependencies; npm view react-leaflet-cluster@2.1.0 peerDependencies]

### Pitfall 2: Inventing a `MobileGpsPoint` table that doesn't exist
**What goes wrong:** The user prompt referenced "MobileGpsPoint rows tenant-scoped per driver with platformGuess hints and battery telemetry." No such table exists in the schema; Phase 5's plan extends `POST /api/agent/location` to write `LocationLog` rows (raw history, no tenantId, boundary via Driver) and upsert `CourierOnlineSession` (tenant-scoped denormalised snapshot — has tenantId, lastGpsAt, lastGpsLat, lastGpsLng, area, isOnline). Adding a third overlapping table would duplicate data and break the existing `liveFleetStatus` + `gpsTrack` consumers. `[VERIFIED: backend/prisma/schema.prisma:971-986 (LocationLog) + 1744-1763 (CourierOnlineSession); .planning/phases/05-mobile-gps-beacon/05-02-PLAN.md:518]`
**Why it happens:** Phases describing data moats use evocative names; that doesn't mean the schema has them. Always grep before assuming a model exists.
**How to avoid:** Phase 7 consumes `CourierOnlineSession` directly. `platformGuess` (Phase 5 hint) lives in the `Device.activePlatformGuess` field per Phase 5's plan (or a `CapturedOrder`-shaped channel); it is NOT a column on a GPS-point table. `batteryLevel` lives on `Device.batteryLevel` (existing). The Floor's right-rail panel reads `Device` via the `Driver → Device` relation.
**Warning signs:** Prisma client throws `Unknown model MobileGpsPoint`; plan-checker flags a non-existent model reference.

### Pitfall 3: SSR import of react-leaflet crashes Next.js build
**What goes wrong:** Importing `MapContainer` (or any react-leaflet component) at the top of a Server Component triggers `ReferenceError: window is not defined` during server render and the page won't render. The Next.js build output mentions this only with a cryptic stack trace.
**Why it happens:** Leaflet, the underlying library, accesses the DOM at module-load time.
**How to avoid:** Every component importing from `react-leaflet`, `leaflet`, or `react-leaflet-cluster` must (a) start with `"use client"` AND (b) be loaded by a parent via `next/dynamic({ ssr: false })`. The existing `frontend/src/components/chat/views/MiniMapView.tsx:10` shows the canonical pattern. Replicate verbatim.
**Warning signs:** Page works in dev but fails on `npm run build`; or works on first load but errors with "Map container is already initialized" on subsequent navigations (this second symptom is fixed by a `useEffect` guard or React StrictMode quirks — see issue PaulLeCam/react-leaflet#936).
[CITED: react-leaflet.js.org/docs/start-introduction; placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i]

### Pitfall 4: Vercel function timeout kills the SSE connection mid-stream
**What goes wrong:** Vercel Hobby caps function duration at 10s; Pro at 300s with Fluid Compute (configurable to 800s). The existing `routes/events.ts` notes this in a comment: "On Vercel serverless this route will be killed after the function timeout, so the frontend should reconnect automatically (EventSource does this natively)."
**Why it happens:** Vercel functions are by design ephemeral; SSE expects long-lived connections.
**How to avoid:** Already handled correctly in the existing code path:
- Server: `routes/events.ts` writes a `:heartbeat\n\n` every 30s to keep proxies happy; close cleans up via `req.on("close", ...)`.
- Client: `useSSE.ts` auto-reconnects with exponential backoff (max 30s) on `onerror`.
- Configure `backend/vercel.json` to set `functions: { "api/index.ts": { maxDuration: 300 } }` on Pro plan — the current `vercel.json` does not set this; Phase 7 should add it as part of the SSE-hardening wave.
**Warning signs:** Client logs show reconnections every 10s (Hobby plan symptom); GPS marker positions visibly "tear" or freeze briefly.
[CITED: vercel.com/docs/functions/configuring-functions/duration; vercel.com/docs/functions/limitations]

### Pitfall 5: Marker "drift" — clustering animation conflicts with frequent position updates
**What goes wrong:** When a courier's GPS updates trigger a marker re-position inside a `MarkerClusterGroup` with `animate: true`, the cluster recalculates and animates the move — sometimes visibly "yanking" markers across the screen. With 50–300 couriers and updates every ~15s per courier, this is constant.
**How to avoid:** Set `animate={false}` on `MarkerClusterGroup` (per the `leaflet.markercluster` README's perf section). Update marker positions via the `Marker`'s `position` prop directly; react-leaflet handles the reposition without re-clustering animation cost. Avoid `<MapContainer>` remounts — keep the same Map instance throughout the page lifetime.
**Warning signs:** Markers appear to "swarm" or visibly jitter; FPS drops below 30 in DevTools Performance.
[CITED: github.com/Leaflet/Leaflet.markercluster — README perf section]

### Pitfall 6: Tenant data leak across SSE subscribers
**What goes wrong:** A bug in `eventBus.publishEvent({...tenantId})` or in `routes/events.ts` would broadcast tenant A's GPS to tenant B's dispatchers. Catastrophic.
**Why it happens:** Channel naming (`events:${tenantId}`) and `sub.subscribe(channel)` MUST match the tenant on the JWT.
**How to avoid:** The existing implementation is correct:
- Channels are keyed `events:${tenantId}` (`eventBus.ts:70`)
- `routes/events.ts:51` reads `tenantId` from `req.user!.tenantId` (set by `sseAuth` from the JWT)
- `subscribe(tenantId, listener)` only adds the listener to the per-tenant channel set
The integration test (Wave 0) MUST seed two tenants, open two EventSource connections, publish to tenant A, assert tenant B's listener received nothing. This is a CON-tenant-scope-everywhere boundary; the plan checker should flag any new event publish that doesn't go through `publishEvent({tenantId, ...})`.
**Warning signs:** Audit log shows an OPS_MANAGER on tenant A seeing a driver from tenant B.

### Pitfall 7: Adding a new action tool for "Ping" instead of reusing `draftCourierMessage`
**What goes wrong:** Forking the Ping flow into a new tool creates a second audit-row shape, a second approve flow, and a second confirm UI. Violates CON-audit-row-shape and CON-action-confirm-card.
**How to avoid:** `draftCourierMessage` (Phase 2) already takes `intent: "WARN_GPS_STALE" | "WARN_ORDER_REJECTIONS" | "WARN_LATE_CLOCKIN" | ...` — these map 1:1 onto the three pill signals. Phase 7's Floor route invokes the existing tool with the appropriate intent. One audit substrate, one approval path.
**Warning signs:** Plan introduces a new file `agent/tools/action/floorPing.ts`. STOP. Use the existing tool.

### Pitfall 8: Order-rejection counter has no existing aggregate
**What goes wrong:** `liveFleetStatus` returns `gpsStaleCount` and `scheduledNotOnlineCount` but **not** `orderRejectionCount`. The third pill ("Order-rejection ×3+") needs a new server-side aggregate over today's order events.
**How to avoid:** The schema has `OrderEvent` (lifecycle events including rejections per CLAUDE.md spec) and `Order` / `OrderLog` tables. Phase 7 must add either:
- (a) An aggregate inside the extended `liveFleetStatus` tool: `COUNT(DISTINCT driverId) WHERE OrderEvent.action='REJECT' AND timestamp>=startOfDay GROUP BY driverId HAVING COUNT(*) >= 3`
- (b) A small new read tool `orderRejectionToday` returning `[{driverId, count}]` (so the pill click can also surface the list of offending drivers)
**Recommendation:** Add both. (a) for the counter (cheap aggregate), (b) for the click-through list view. Both are tenant-scoped via the existing `defineTool` pattern. The exact schema (`OrderEvent.action='REJECT'` vs an enum value vs a `rejectedAt` column on Order) needs grep verification in the planning step — the CLAUDE.md spec mentions REJECT events but the schema columns to verify are: `OrderEvent.action`, `Order.status`, `OrderLog.status`.
**Warning signs:** Plan writes a SQL query against a column that doesn't exist; counter returns 0 even when test fixture seeds rejections.

### Pitfall 9: EventSource on Vercel Hobby plan reconnects every 10s
**What goes wrong:** Hobby plan caps function duration at 10s. SSE reconnects every 10s — usable but visibly choppy.
**How to avoid:** This is a deployment concern, not a code one. Confirm with the user that backend deploys on Vercel Pro (the existing `backend/vercel.json` exists and the Phase 4 research notes both surfaces are on Vercel). If on Hobby, either upgrade or move the backend to a long-lived host (Render/Railway). Set `vercel.json` → `functions["api/index.ts"].maxDuration: 300` after upgrade.
**Warning signs:** Client logs show `EventSource closed`/`EventSource reconnecting` every ~10s during a smoke test.

### Pitfall 10: Browser tab in background pauses EventSource (intermittently)
**What goes wrong:** Modern browsers throttle background tabs; an SSE connection in a background tab may stop receiving updates for several minutes. When the dispatcher tabs back, the map is "frozen" at the last received state.
**How to avoid:** On `document.visibilitychange`, force a manual refresh of `/api/floor/snapshot` to re-seed marker positions; the SSE delta stream resumes naturally. This is a 4-line addition to `LiveFloorPage.tsx`.
**Warning signs:** Dispatcher reports "the map froze" after going to lunch with the tab open.

## Code Examples

### Existing pattern: SSE stream from tenant-scoped Redis channel
```typescript
// backend/src/routes/events.ts (existing — DO NOT REWRITE for Phase 7)
router.get("/", (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 30_000);
  res.write(`event: connected\ndata: ${JSON.stringify({ tenantId, timestamp: new Date().toISOString() })}\n\n`);
  const unsubscribe = subscribe(tenantId, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});
// Source: /Users/mac/Documents/Darb/backend/src/routes/events.ts
```

### Existing pattern: tenant-scoped event bus (Redis pub/sub + in-process fallback)
```typescript
// backend/src/services/eventBus.ts (existing)
export type DarbEventType =
  | "alert" | "violation" | "notification"
  | "driver_update" | "score_update"
  | "appeal_submitted" | "cash_record_upserted"
  | "agent_action_pending" | "agent_action_resolved"
  | "briefing_published"
  // Phase 7 EXTENSIONS — add these two:
  | "gps_point"
  | "online_session_update";

export async function publishEvent(event: DarbEvent): Promise<void> { /* ... */ }
export function subscribe(tenantId: string, listener: Listener): () => void { /* ... */ }
// Source: /Users/mac/Documents/Darb/backend/src/services/eventBus.ts
```

### Existing pattern: SSR-skipped Leaflet via next/dynamic
```typescript
// frontend/src/components/chat/views/MiniMapView.tsx (existing — replicate for Floor)
"use client";
import dynamic from "next/dynamic";

const LeafletMap = dynamic(
  () => import("./MiniMapLeaflet").then((m) => m.MiniMapLeaflet),
  { ssr: false, loading: () => <div>Loading map…</div> }
);
// Source: /Users/mac/Documents/Darb/frontend/src/components/chat/views/MiniMapView.tsx
```

### Existing pattern: SSE client hook with auto-reconnect + token-in-query
```typescript
// frontend/src/hooks/useSSE.ts (existing — DO NOT REWRITE)
export function useSSE({ url, onMessage, enabled = true }: UseSSEOptions) {
  // ... existing implementation
  // - Adds ?token=<accessToken> automatically
  // - Reconnects with exponential backoff (max 30s)
  // - Cleans up on unmount
}
// Source: /Users/mac/Documents/Darb/frontend/src/hooks/useSSE.ts
```

### NEW pattern: Floor courier dot composition
```typescript
// frontend/src/components/floor/CourierMarker.tsx (NEW)
"use client";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

type CourierStatus = "WORKING" | "IDLE" | "STALE" | "SCHEDULED_NOT_ONLINE";
type Platform = "KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA";

const STATUS_BG: Record<CourierStatus, string> = {
  WORKING: "bg-emerald-500",
  IDLE: "bg-sand-400",
  STALE: "bg-red-500",
  SCHEDULED_NOT_ONLINE: "bg-blue-500",
};
const PLATFORM_RING: Record<Platform, string> = {
  KEETA: "ring-keeta",
  TALABAT: "ring-talabat",
  DELIVEROO: "ring-deliveroo",
  AMERICANA: "ring-americana",
};

export function CourierMarker({ courier, onSelect }: {
  courier: { id: string; lat: number; lng: number; status: CourierStatus; platform: Platform; name: string };
  onSelect: (driverId: string) => void;
}) {
  const icon = useMemo(() => L.divIcon({
    html: `<div class="${STATUS_BG[courier.status]} ${PLATFORM_RING[courier.platform]} ring-2 ring-offset-1 rounded-full w-3.5 h-3.5"></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  }), [courier.status, courier.platform]);

  return (
    <Marker
      position={[courier.lat, courier.lng]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(courier.id) }}
    >
      <Popup>{courier.name}</Popup>
    </Marker>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling /overview endpoints | SSE-driven map deltas | 2026-05 (this phase) | Real-time map without serverless cost explosion |
| WebSocket as the default realtime transport on Vercel | SSE on Vercel Fluid Compute (Pro plan 300s default, 800s max) | Vercel Fluid Compute 2025+ | Unidirectional streams are first-class; no WS server hosting needed |
| react-leaflet@4 (React 18) | react-leaflet@5 (React 19) | Q1 2025 with React 19 release | We stay on v4.2.1 until the project moves to React 19 |
| Hand-rolled clustering | leaflet.markercluster + chunkedLoading | Stable since ~2017; still SOTA for ≤10k markers | No new lib needed |
| Mapbox / Google Maps default | OSM tiles for fleet dashboards | Long-standing tradeoff: cost vs vector-tile features. Darb's glanceable-2D-only use case → OSM wins. | Zero per-load cost |

**Deprecated/outdated:**
- BullMQ `repeat` API (replaced by `JobScheduler` per Phase 4) — not used by Phase 7
- Vercel function default of 10s (Hobby) / 15s (Pro) — Fluid Compute raises Pro default to 300s, configurable to 800s

## Project Constraints (from CLAUDE.md)

| Directive | How Phase 7 Honors It |
|-----------|----------------------|
| TypeScript strict mode throughout | All new files use strict mode (inherited from `tsconfig.json`) |
| Prisma for all DB access (no raw SQL unless aggregation requires) | All Floor reads use Prisma; aggregations stay inside the agent read tools, which already use Prisma |
| All routes use authMiddleware + tenantScope | `/api/floor/*` registered after the shared middleware chain in `server.ts` |
| Pagination via getPagination() + paginatedResponse() utils | The `/snapshot` endpoint is not paginated (a tenant's online couriers fit in one response at ≤500 rows); `/counters` is scalar. If a future "all couriers" sub-page is added, it uses the existing helpers |
| try/catch in every route, return `{ error: message }` | All three new routes follow the pattern |
| Frontend: Tailwind utility classes, Shadcn components, Lucide icons | All new components use Tailwind tokens + Lucide icons |
| Arabic/English bilingual support via i18n directory | Floor is owner/dispatcher-facing → English-only per CON-bilingual-outbound (owner UI English-only in v1, full RTL deferred to Y2). The "Ping (WhatsApp)" *message body* may eventually be bilingual via Phase 9; v1 ships English-only drafts |
| Platform-specific code lives under platform-named directories | Floor is cross-platform by design; lives under `frontend/src/app/(dashboard)/floor/` and `backend/src/routes/floor.ts`, NOT under any platform directory |

## User Constraints (derived from PROJECT.md / ROADMAP.md / REQUIREMENTS.md / PRD)

> No `CONTEXT.md` exists for Phase 7 — research is standalone. The constraints below are derived from upstream and are authoritative.

### Locked Decisions (inherited from upstream)

- **REQ-floor-live-map** (CON-floor-dot-colors, CON-floor-counters): green=working / grey=idle / red=GPS-stale / blue=scheduled-not-online; three pill counters (Scheduled-not-online, GPS-stale >10 min, Order-rejection ×3+); right-slide panel; "Ping (WhatsApp)" one-click action with confirm card.
- **CON-realtime-protocols** (re-interpreted): "Add WebSocket for live floor map subscriptions." Phase 4 research established the precedent for re-reading this as "any persistent server-push transport." Phase 7 ships SSE. Surface to user during `/gsd-discuss-phase` if the team wants to lock the re-interpretation.
- **CON-action-confirm-card**: every action tool emits a confirm card; no exceptions. The Ping button reuses `draftCourierMessage` + `/api/decisions/:id/approve`.
- **CON-audit-row-shape**: every fired action writes `AgentAction` with proposer="Darb", approver=userId, etc. Reuse the Phase 2 substrate.
- **CON-tenant-scope-everywhere**: every new endpoint passes through `authMiddleware + tenantScope`. The Redis pub/sub channels are per-tenant.
- **CON-stack-frontend**: Next.js 14 + Tailwind + Shadcn — no library swaps.
- **CON-stack-backend-pinned**: Express 4 + Prisma 5 + Redis 7 + BullMQ — no new transports.
- **DEC-role-based-landing**: Dispatcher → Floor (so `/floor` is the OPS_MANAGER default landing).
- **DEC-add-realtime-streaming**: Keep SSE for notifications; WebSocket "for live floor map subscriptions" — Phase 7 honors the spirit (server-push) with SSE per Phase 4 precedent.

### Claude's Discretion (Phase 7 freedom areas)

- **react-leaflet major version** — recommendation: downgrade to v4.2.1 + cluster@2.1.0 (Pitfall 1). The planner may choose to keep v5 if user is willing to accept the legacy-peer-deps risk; the v4 downgrade is cheaper and the recommendation.
- **Order-rejection aggregate location** — extend `liveFleetStatus` vs add `orderRejectionToday` tool. Recommendation: add both (one for counter, one for list-view).
- **Filter state persistence** — URLSearchParams (recommended) vs localStorage. Recommended: URLSearchParams for shareable URLs.
- **Search-by-name implementation** — client-side filter (recommended) vs server endpoint.
- **Pill click-through** — open a side-panel list of affected drivers (recommended) vs filter the map markers in place. Both can coexist.
- **Map default centre/zoom** — Kuwait City: `center=[29.3759, 47.9774]`, `zoom=11` (recommendation, matches existing `MiniMapLeaflet`).
- **Tile provider choice** — OpenStreetMap (recommended, free) vs CartoDB (cleaner Apple-inspired aesthetic, also free).

### Deferred Ideas (OUT OF SCOPE for Phase 7)

- **WebSocket transport** — deferred again to "later" if a real bidirectional use case emerges. Phase 7 ships SSE.
- **Live floor heat-map / density overlay** — not in CON-floor-counters; out of scope.
- **Multi-tenant cross-fleet view (super-admin)** — Phase 11+; explicitly not in v1.
- **Routing / dispatching algorithms** ("assign this order to nearest driver") — Phase 8 (action tools include `reassignShift` but not automated dispatch).
- **GPS replay / time-scrubber** — Phase 8 chat-generated mini-map view if requested by user; not on the live Floor.
- **Mobile-app dispatcher Floor** — Y2 per CON-non-goals-12-months ("Mobile-first chat. Owner uses Darb at a desk").
- **Voice / push-to-talk to courier** — Phase 2+ non-goal.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-floor-live-map | Default landing for dispatcher role. Live map of Kuwait, all platforms, real-time. Every online driver = a coloured dot (green=working, grey=idle, red=GPS-stale, blue=scheduled-not-online). Each dot tagged with platform colour. Three pill counters at top: Scheduled-not-online, GPS-stale (>10 min), Order-rejection ×3+ — each clickable, filters the map. Click a dot → right panel slides out with driver details (phone, vehicle, current order, last GPS, today's stats). One action per driver: "Ping (WhatsApp)" — agent drafts message, dispatcher one-clicks send. | Architecture Patterns §1-§7 (SSE substrate, react-leaflet SSR-safe, clustering config, divIcon composition, ping reuse); Don't Hand-Roll table (every primitive already exists); Pitfalls 1-10. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis (pub/sub for eventBus) | `services/eventBus.ts` SSE fan-out across multiple Express instances | ✓ via `env.REDIS_URL` | Configurable (production uses managed Redis 7) | In-process EventEmitter fallback already coded in `eventBus.ts:65` — single-process dev/test works without Redis |
| PostgreSQL 15 | `CourierOnlineSession`, `Driver`, `Shift`, `Order`, `OrderEvent` reads | ✓ | 15 | — |
| Vercel functions (Pro plan, Fluid Compute) | SSE long-lived connections, 300s default duration | Inferred ✓ (backend has `vercel.json`; Phase 4 confirms Vercel Pro deployment) | 300s default, 800s configurable | If on Hobby (10s timeout), reconnects every 10s — usable but choppy; recommend Pro |
| `react-leaflet`, `leaflet`, `react-leaflet-cluster` | Frontend map | ✓ already installed | v5.0.0 / 1.9.4 / 4.1.3 (downgrade to 4.2.1 / 1.9.4 / 2.1.0 recommended) | — |
| OpenStreetMap tile servers | Map tiles | ✓ (already used by `MiniMapLeaflet`) | — | Switch to CartoDB if OSM is rate-limited at scale (unlikely for one dispatcher per tenant) |
| Phase 5 mobile GPS pipeline | Populating `CourierOnlineSession.lastGpsAt/Lat/Lng` for all platforms | ⚠ Phase 5 IN PROGRESS | — | If Phase 7 ships before Phase 5 is fully wired, the Floor map will show only Keeta drivers (today's only writer). Plan dependency: Phase 5 Wave 2 must land first. |
| Phase 6 ingest adapter layer | Producing canonical Order/Shift normalised rows used by `liveFleetStatus` and the rejection-count aggregate | ⚠ Phase 6 IN PROGRESS | — | If Phase 6 isn't wired, scheduled-not-online still works (reads `Shift` directly); rejection-count may need to fall back to a temporary query on `Order.status='REJECTED'` rather than the adapter's normalised view. |

**Missing dependencies with no fallback:** None — Phase 7 is composition over existing substrate; every dependency has a fallback or is already in place.

**Missing dependencies with fallback:** Phase 5/6 not-yet-complete is the only meaningful dependency. Phase 7 can be built and tested against the current state (Keeta-only `CourierOnlineSession` writes); the cross-platform fan-out lights up automatically as Phase 5's location-route extension lands.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | Jest (existing — `cd backend && npm test`) |
| Frontend framework | Vitest (existing — `cd frontend && npm test`) |
| Quick run command (backend) | `cd backend && npx jest routes/floor` |
| Quick run command (frontend) | `cd frontend && npx vitest run components/floor` |
| Full suite (backend) | `cd backend && npm test` |
| Full suite (frontend) | `cd frontend && npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-floor-live-map | `GET /api/floor/snapshot` returns tenant-scoped online couriers with required fields | integration (backend) | `cd backend && npx jest routes/floor.snapshot` | ❌ Wave 0 |
| REQ-floor-live-map | `GET /api/floor/counters` returns three counts; tenant-isolated | integration (backend) | `cd backend && npx jest routes/floor.counters` | ❌ Wave 0 |
| REQ-floor-live-map | `POST /api/floor/ping/:driverId` stages a `PendingAgentAction` via `draftCourierMessage`; no send before Approve | integration (backend) | `cd backend && npx jest routes/floor.ping` | ❌ Wave 0 |
| REQ-floor-live-map | `POST /api/agent/location` publishes `gps_point` to tenant channel | integration (backend) | `cd backend && npx jest agent/locationEventPublish` | ❌ Wave 0 |
| REQ-floor-live-map | SSE subscriber receives `gps_point` for own tenant; does NOT receive for other tenant | integration (backend) | `cd backend && npx jest routes/events.tenantIsolation` | ❌ Wave 0 |
| REQ-floor-live-map | `liveFleetStatus` extended with `orderRejectionCount` returns expected aggregate from fixture | integration (backend) | `cd backend && npx jest agent/tools/read/liveFleetStatus.rejectionCount` | ❌ Wave 0 |
| REQ-floor-live-map | `<LiveFloorPage/>` renders three pill counters from `/api/floor/counters` response | unit (frontend) | `cd frontend && npx vitest run components/floor/FloorPillCounters` | ❌ Wave 0 |
| REQ-floor-live-map | `<LiveFloorMap/>` renders one marker per courier in the snapshot | unit (frontend, jsdom) | `cd frontend && npx vitest run components/floor/LiveFloorMap` | ❌ Wave 0 |
| REQ-floor-live-map | Marker click opens `<CourierDetailPanel/>` with the right driverId | unit (frontend) | `cd frontend && npx vitest run components/floor/CourierDetailPanel` | ❌ Wave 0 |
| REQ-floor-live-map | Ping button POSTs to `/api/floor/ping/:driverId` and renders `<ChatActionCard/>` on response | unit (frontend) | `cd frontend && npx vitest run components/floor/PingButton` | ❌ Wave 0 |
| REQ-floor-live-map | Filter pills sync to URLSearchParams | unit (frontend) | `cd frontend && npx vitest run components/floor/FloorFilters` | ❌ Wave 0 |
| REQ-floor-live-map | GPS-stale colour applied when `lastGpsAt > 10min ago` | unit (frontend) | `cd frontend && npx vitest run components/floor/CourierMarker.stale` | ❌ Wave 0 |
| REQ-floor-live-map | Walking skeleton: end-to-end snapshot → SSE update → marker re-position | integration (frontend + backend supertest) | `cd backend && npx jest routes/floor.walkingSkeleton` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest routes/floor` AND `cd frontend && npx vitest run components/floor` (≤30s each)
- **Per wave merge:** `cd backend && npm test` AND `cd frontend && npm run test:run` (full suites)
- **Phase gate:** Full suites green before `/gsd-verify-work`; smoke test against deployed Vercel preview with a seeded fixture tenant having 5–10 couriers across 4 platforms.

### Wave 0 Gaps
- [ ] `backend/src/__tests__/routes/floor.snapshot.test.ts` — covers tenant scoping + payload shape
- [ ] `backend/src/__tests__/routes/floor.counters.test.ts` — covers three counts + tenant scoping
- [ ] `backend/src/__tests__/routes/floor.ping.test.ts` — covers staging PendingAgentAction + reuse of draftCourierMessage
- [ ] `backend/src/__tests__/routes/floor.walkingSkeleton.test.ts` — end-to-end snapshot+SSE+approve
- [ ] `backend/src/__tests__/agent/locationEventPublish.test.ts` — verifies POST /location publishes `gps_point`
- [ ] `backend/src/__tests__/routes/events.tenantIsolation.test.ts` — verifies cross-tenant SSE leak prevention
- [ ] `backend/src/__tests__/agent/tools/read/liveFleetStatus.rejectionCount.test.ts` — new aggregate
- [ ] `frontend/src/__tests__/components/floor/LiveFloorPage.test.tsx` — top-level integration
- [ ] `frontend/src/__tests__/components/floor/LiveFloorMap.test.tsx` — marker rendering (jsdom, mock react-leaflet)
- [ ] `frontend/src/__tests__/components/floor/FloorPillCounters.test.tsx`
- [ ] `frontend/src/__tests__/components/floor/FloorFilters.test.tsx`
- [ ] `frontend/src/__tests__/components/floor/CourierDetailPanel.test.tsx`
- [ ] `frontend/src/__tests__/components/floor/CourierMarker.stale.test.tsx`
- [ ] `frontend/src/__tests__/components/floor/PingButton.test.tsx`
- [ ] No new framework install needed (Jest + Vitest already wired)
- [ ] Add `tests/fixtures/floor-couriers.ts` with 10 couriers across 4 platforms, 2 stale, 1 scheduled-not-online

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Existing JWT (`auth.ts`) — Floor inherits; SSE uses token-in-query (browser API limitation) |
| V3 Session Management | yes | 15-min access + 7-day refresh (existing); SSE reconnects re-validate the JWT on each EventSource (re)open |
| V4 Access Control | yes | RBAC: `OPS_MANAGER`, `ADMIN`, `SUPERVISOR` only on `/api/floor/*` and `/floor` |
| V5 Input Validation | yes | `zod` for `POST /ping/:driverId` body; existing pattern in `defineTool` for tool inputs |
| V6 Cryptography | no | No new crypto; reuse JWT secret |
| V8 Data Protection | yes | Tenant-scoped pub/sub channel naming (`events:{tenantId}`); RBAC + tenantScope on all reads |
| V12 Files & Resources | no | No new file uploads |
| V13 API & Web Service | yes | SSE response Content-Type, no-cache, no-buffering headers already correct in `routes/events.ts` |

### Known Threat Patterns for Live Floor

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak via SSE channel name collision | Information Disclosure | Channel keyed by tenantId from JWT (existing `eventBus.channelKey`); integration test asserts isolation (Wave 0) |
| JWT in EventSource query string leaks via browser history / proxy logs | Information Disclosure | Short-lived 15-min access tokens (existing); auto-reconnect with fresh token; recommend HTTPS-only (already enforced on Vercel) |
| Replay of a stale SSE event causes false "online" status | Tampering | Each event carries a `timestamp`; client discards events whose `timestamp` is older than the current `lastGpsAt` for that driver |
| Map tile injection from compromised tile server | Tampering | OSM tile URLs are HTTPS and hashed by client; mitigated by browser-level cert validation |
| Action approval bypass on Ping button | Elevation of Privilege | Reuses Phase 2's `requiresApproval=true` gate; the registry stages PendingAgentAction, no write fires without `/api/decisions/:id/approve` |
| DOS via opening many SSE connections | Denial of Service | Existing Express rate limiter (`apiLimiter` in `server.ts:164`); add per-IP cap if needed in monitoring |
| Markers leak business intelligence about competitor fleets (theoretical) | Information Disclosure | Tenant scope; no cross-tenant aggregation; consider obfuscating "currentOrderId" if a viewer-role is later added with map access |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Backend deploys on Vercel Pro plan (Fluid Compute available) so SSE can hold for 300s | Pitfall 4, Environment Availability | If on Hobby, dispatchers see reconnects every 10s — usable but choppy. Verify with user. |
| A2 | The `OrderEvent.action` field carries a value like `"REJECT"` (or a related Order/OrderLog status) usable for the order-rejection aggregate | Pitfall 8 | Aggregate query path may need a different column. Grep `OrderEvent`, `Order.status`, `OrderLog.status` in planning step. |
| A3 | `Device.batteryLevel` is the canonical battery field shown in the right-rail panel | Architecture Map | Phase 5 confirms `Device.batteryLevel` exists and is populated; no risk if Phase 5 wave 1 lands first. |
| A4 | Phase 5 has not yet landed the cross-platform `POST /location` extension to upsert CourierOnlineSession | Environment Availability | If Phase 5 finishes during Phase 7 build, no impact. If Phase 5 is delayed, only Keeta drivers appear on the Floor until Phase 5 lands. Plan should sequence Phase 7 to start after Phase 5 Wave 2. |
| A5 | Tile provider OpenStreetMap is acceptable for the design (vs CartoDB cleaner aesthetic) | Standard Stack | Aesthetic-only; trivially swappable. |
| A6 | Kuwait City default centre `[29.3759, 47.9774]` and zoom 11 are correct | Code Examples | Verify with user / visual check during dev. |
| A7 | "Ping (WhatsApp)" sends via the existing Notification → Phase 9 channel (currently IN_APP only) | Pattern 5 | The send path itself is Phase 9; v1 Floor produces a Notification row, real WhatsApp send is Phase 9. Plan checker should call this out. |
| A8 | Existing react-query setup is configured with the right defaults for the Floor's polling needs | Standard Stack | If `staleTime`/`refetchInterval` defaults are aggressive, may over-fetch. Recommend explicit `staleTime: 25000, refetchInterval: 30000` on the counters query. |
| A9 | The three pill signals all map cleanly to existing `draftCourierMessage` intents (`WARN_GPS_STALE`, `WARN_ORDER_REJECTIONS`, `WARN_LATE_CLOCKIN`) | Pitfall 7 | Verified: `WARN_LATE_CLOCKIN` covers "scheduled-not-online" (driver scheduled but not online → late clock-in). Direct mapping. |
| A10 | We can downgrade react-leaflet from v5 to v4.2.1 without API changes to existing `MiniMapLeaflet.tsx` | Pitfall 1 | The MapContainer/TileLayer/Marker/Popup APIs are identical in v4 and v5; only types and React-version peer changed. Confirm with a smoke test of the chat mini-map after downgrade. |

## Open Questions

1. **react-leaflet major version: pin to v4.2.1 OR keep v5 with `--legacy-peer-deps` override?**
   - What we know: v5 declares React 19 peerDep (mismatch); v4.2.1 declares React 18 (correct fit). APIs are compatible between v4 and v5.
   - What's unclear: Whether the user wants a stable downgrade or wants to stay current with the v5 line for forward-compat.
   - Recommendation: Downgrade to v4.2.1 in the same wave that adds the Floor map. Documented as Pitfall 1. Plan-checker should confirm with user during `/gsd-discuss-phase`.

2. **Pill click-through behaviour: filter the map in place OR open a side-panel list of affected drivers?**
   - What we know: CON-floor-counters says "each clickable, filters the map." PRD §5.2 says "Click → filtered list."
   - What's unclear: The two read as slightly different UX (map filter vs list view).
   - Recommendation: Do both — the click filters the map AND opens a list-style overlay/drawer showing the driver names; clicking a name opens the right-rail panel. Surface to user.

3. **Should the Floor right-rail panel embed a Driver File mini-card or just link out?**
   - What we know: Phase 3 Driver File has 8 sections; embedding all is overkill.
   - What's unclear: How much the dispatcher wants to see without leaving Floor.
   - Recommendation: Embed score chip + current order + last 5 events + Ask Darb Why; full file is one click via `DriverLink`. Surface to user during design review.

4. **Is the Floor a dispatcher-only surface, or do owners want to access it too?**
   - What we know: PRD says "Dispatcher → Floor" as default landing. Owner landing is Decisions.
   - What's unclear: Whether owners want to dip in occasionally.
   - Recommendation: Allow ADMIN + OPS_MANAGER + SUPERVISOR roles to view Floor; only the dispatcher's nav has it pinned at the top. Surface to user.

5. **Real WhatsApp send path — Phase 7 or Phase 9?**
   - What we know: Phase 7 produces a `Notification` row via `draftCourierMessage`; real WhatsApp delivery is Phase 9.
   - What's unclear: Whether v1 dispatchers will be confused that "Ping (WhatsApp)" creates an IN_APP notification instead of a real WhatsApp message.
   - Recommendation: Label the button "Send via Darb" or "Send approval-gated message" in v1; rename to "Ping (WhatsApp)" when Phase 9 lands the real delivery. OR: ship Phase 7 with a manual "open WhatsApp web with prefilled body" deep link as an interim. Surface to user.

6. **Order-rejection aggregate — extend existing `liveFleetStatus` or add `orderRejectionToday` tool?**
   - What we know: liveFleetStatus has gpsStaleCount + scheduledNotOnlineCount; not rejection.
   - What's unclear: Whether the chat agent will want the rejection list separately (for `chat: "show me rejection-heavy drivers today"`).
   - Recommendation: Add both. Counter goes into liveFleetStatus; list-shaped data goes into a new `orderRejectionToday` tool.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/react-leaflet_js` — Marker/MapContainer/TileLayer APIs, SSR caveats
- Context7 `/leaflet/leaflet.markercluster` — chunkedLoading, disableClusteringAtZoom, maxClusterRadius, animate option, addLayers performance
- npm registry — `react-leaflet@4.2.1` / `react-leaflet@5.0.0` / `react-leaflet-cluster@2.1.0` / `react-leaflet-cluster@4.1.3` peerDependencies verified live during research
- `backend/src/routes/events.ts` — existing SSE pattern (tenant-scoped, JWT-in-query, heartbeat, auto-reconnect)
- `backend/src/services/eventBus.ts` — existing Redis pub/sub with in-process fallback
- `backend/src/agent/tools/read/liveFleetStatus.ts` — existing Phase 1 tool the Floor reuses
- `backend/src/agent/tools/action/draftCourierMessage.ts` — existing Phase 2 tool the Ping reuses
- `backend/src/agent/tools/read/gpsTrack.ts` — existing Phase 1 tool for historical replay
- `backend/prisma/schema.prisma:1744-1763` — `CourierOnlineSession` model
- `backend/prisma/schema.prisma:971-986` — `LocationLog` model
- `backend/prisma/schema.prisma:1840-1856` — `OrderEvent` model (for rejection-count aggregate)
- `frontend/src/components/chat/views/MiniMapView.tsx` + `MiniMapLeaflet.tsx` — existing dynamic-import + react-leaflet pattern
- `frontend/src/components/shared/SlidePanel.tsx` — existing right-rail panel primitive
- `frontend/src/components/shared/DriverLink.tsx` — existing driver-name link primitive
- `frontend/src/components/driver-file/AskDarbWhyDrawer.tsx` — existing Ask Darb pattern
- `frontend/src/hooks/useSSE.ts` — existing SSE client hook
- `frontend/tailwind.config.ts` — existing platform color tokens (keeta/talabat/deliveroo/americana)
- `.planning/PROJECT.md` — Constraints (CON-floor-dot-colors, CON-floor-counters, CON-realtime-protocols, CON-action-confirm-card, CON-audit-row-shape, CON-tenant-scope-everywhere)
- `.planning/REQUIREMENTS.md` — REQ-floor-live-map full text
- `.planning/phases/04-chat-generative-ui-websocket/04-RESEARCH.md` — Phase 4 SSE-over-WebSocket precedent

### Secondary (MEDIUM confidence)
- vercel.com/docs/functions/configuring-functions/duration — Vercel Pro 300s default, 800s configurable with Fluid Compute
- vercel.com/docs/functions/limitations — function timeout per plan
- github.com/Leaflet/Leaflet.markercluster README — chunkedLoading + animate perf tradeoffs
- placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i — Next.js + Leaflet pattern (corroborates existing `MiniMapView.tsx`)
- nextjs.org/docs/pages/guides/lazy-loading — `next/dynamic` with `ssr: false`
- hirenodejs.com/blog/nodejs-server-sent-events-sse-2026 — production SSE patterns
- redis.io/docs/latest/develop/pubsub/ — Redis pub/sub semantics (corroborates existing eventBus impl)

### Tertiary (LOW confidence — flagged for validation)
- npm-compare.com supercluster vs leaflet.markercluster — performance comparison; our scale (≤300 markers) is well below either's threshold so the comparison is academic
- FlowVerify "SSE vs WebSockets vs Polling 2026 Decision Guide" — corroborates SSE-for-unidirectional-push but not authoritative

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every recommended lib is already installed; only one version decision (react-leaflet v4 vs v5) carries any new dependency surface
- Architecture: HIGH — SSE substrate (eventBus + events.ts), action substrate (draftCourierMessage + decisions approve), driver-file substrate (DriverLink + AskDarbWhyDrawer), slide-panel substrate, all already shipped and grep-verified
- Pitfalls: HIGH — five of the ten are well-documented in upstream research (Phase 4 SSE-on-Vercel, Phase 5 GPS schema), the others verified live during this research session
- Validation: MEDIUM — Jest + Vitest framework set is solid, but the specific test file paths are predictive — confirm during planning

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (30 days — stack is stable, only react-leaflet's v5/React-19 dependency is fast-moving but the v4 line is frozen)
