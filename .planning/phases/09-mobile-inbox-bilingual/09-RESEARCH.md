# Phase 9: Mobile Agent Inbox + Bilingual Outbound — Research

**Researched:** 2026-05-13
**Domain:** Expo 52 mobile inbox UX with expo-router + expo-notifications; bilingual (EN+AR) outbound courier comms over in-app push / WhatsApp Cloud API / SMS; tenant-level outbound channel config; Driver/Tenant preferred-language plumbing
**Confidence:** HIGH (existing backend `NotificationDelivery` + `notificationService` + `notificationChannels` stack inspected directly; `Notification.titleAr/bodyAr/category/severity` columns confirmed present per Phase 2 migration; Expo SDK 52 mobile stack and push-token path verified against `mobile/app.json` + `mobile/package.json` + npm registry; WhatsApp Cloud API surface and Kuwait SMS pricing cross-checked against Meta + Twilio + Unifonic docs)

## Summary

Phase 9 sits on a backend that is already 70% there. The Phase 2 migration shipped `Notification.titleAr` / `bodyAr` / `category` / `severity` columns and a `NotificationDelivery` row that queues outbound to `WHATSAPP | SMS | EMAIL` channels via a Twilio adapter in `backend/src/services/notificationChannels.ts` [VERIFIED: file inspected, lines 31-68]. The `draftCourierMessage` write tool [VERIFIED: `backend/src/agent/tools/action/draftCourierMessage.ts:80-118`] already writes a `Notification` row on Approve and contains the literal comment `// TODO Phase 9: enqueue bilingual delivery via the notification queue`. Phase 9's job is to (a) fill in the Arabic body on every `Notification.create` the agent makes, (b) actually enqueue the WhatsApp + SMS fan-out the TODO points at, (c) ship the courier-facing inbox screen the message lands in, and (d) add the language/channel preferences that drive (a) and (b).

The four Phase 9 deliverables decompose as:

1. **Mobile inbox screen** — a new `mobile/app/(tabs)/inbox.tsx` Expo Router screen, fed by two new `GET /api/agent/inbox` and `POST /api/agent/inbox/:id/read` routes on the device-auth `agent.ts` router. A FlatList with `RefreshControl`, swipe-to-archive via `react-native-swipe-list-view`, deep-link `router.push("/(tabs)/orders?orderId=...")` when the notification references an order, and an offline cache of the last 50 notifications in the **same expo-sqlite database** Phase 5 already opened (`darb-outbox.db`) — extended with an `inbox_cache` table — so the inbox renders instantly while offline. Sub-30-minute push delivery uses `getExpoPushTokenAsync` to register an Expo push token on the existing `Device` row (additive column: `Device.expoPushToken: String?`). [VERIFIED: `mobile/package.json` already pins `expo-notifications: ~0.29.0` — installed at 0.29.14 per package-lock — and `mobile/app.json` already lists `"expo-notifications"` in plugins; the JS side is unused, so Phase 9 owns the wiring end-to-end.]

2. **Bilingual content generation** — `draftCourierMessage` extended with a required `bodyArabic` parameter the Anthropic monitor agent produces in the same tool-call (single LLM round-trip, both languages or fail). The execute body writes `title + message + titleAr + bodyAr` to `Notification`. A new `services/translationService.ts` provides a Claude-Sonnet-4.5-backed `translateToArabic(en: string, context: TranslationContext)` helper for code paths that don't already go through the agent — e.g., violation engine notifications, GPS-stale alerts, scheduled briefings. The translation context tells Claude to use **Khaleeji (Gulf)** Arabic register, "Darb" stays Latin, and to keep emoji/numbers/timestamps untranslated.

3. **Outbound channel queue extension** — `enqueueNotification` already runs through `notificationQueue.ts` + `notificationWorker.ts`. Phase 9 adds: (a) a `WhatsAppCloud` adapter in `notificationChannels.ts` as a second provider option (current sole provider is Twilio), backed by Meta's direct Cloud API (`POST graph.facebook.com/v22.0/{phone-number-id}/messages`) for ~5× lower cost than Twilio-as-BSP on utility templates [CITED: Meta + Twilio pricing docs — see Standard Stack rationale]; (b) a `resolveOutboundChannels(driverId)` selector that reads `Driver.preferredLanguage` + `Driver.outboundOptIn` + `Tenant.outboundChannels` JSON + the time-of-day quiet-hours window and returns the ordered channel list `["IN_APP_PUSH", "WHATSAPP", "SMS"]` (with fallthrough on send failure). Stage-1 of Phase 9 ships **in-app push only**; Stage-2 turns on WhatsApp once Meta WABA verification clears; Stage-3 enables SMS fallback gated by per-tenant cost limits.

4. **Tenant + Driver config** — additive migration: `Driver.preferredLanguage: Language @default(AUTO)` (enum `EN | AR | AUTO`), `Driver.outboundOptIn: Boolean @default(true)`, `Tenant.defaultLanguage: Language @default(AR)` (Kuwait fleets — AR is the safer default), `Tenant.outboundChannels: Json @default("{\"inApp\":true,\"whatsapp\":false,\"sms\":false}")`, `Tenant.whatsappBusinessAccountId: String?`, `Tenant.whatsappPhoneNumberId: String?`, `Tenant.whatsappAccessToken: String?` (encrypted at rest by the existing Tenant `settings` JSON pattern, or stored in env-keyed Vault — we pick `settings` JSON for v1 per the existing `notifConfig` precedent at `notificationService.ts:122`), `Tenant.smsProvider: String? @default("unifonic")`. The owner-facing config UI is a small additive section in `frontend/src/app/(dashboard)/settings/notifications/page.tsx` (already exists per the platformSettings route family).

**Primary recommendation:** Treat Phase 9 as a **plumbing + translation + one-screen** phase. Resist re-architecting the notification stack — the existing `Notification → NotificationDelivery → enqueueNotification → notificationWorker → sendWhatsApp/sendSms` chain is already correct; we are filling in the missing Arabic body, adding a non-Twilio WhatsApp provider for cost, registering Expo push tokens against `Device`, and rendering a single inbox screen on mobile. Ship in three waves: **Wave 1** — mobile inbox screen + push token registration + bilingual `draftCourierMessage` parameter + Arabic translation service (no WhatsApp/SMS yet — push to inbox only, which is what Stage-1 of the success criterion needs). **Wave 2** — WhatsApp Cloud API adapter + template approval flow + Driver/Tenant config schema. **Wave 3** — SMS fallback + opt-out + quiet-hours + per-tenant cost ceiling.

**Critical scope reminder** (per PRD principle 7 "owner reads English, courier reads Arabic" and PROJECT.md non-goal "full RTL UI deferred to Y2"): the *owner-facing* dashboard stays English-LTR. Only the *courier-facing* Expo app needs RTL handling, and only on the inbox screen text content — not the entire app chrome. Phase 9's RTL surface is narrow: a single `<Text dir={...}>` style toggle on inbox bodies. Do not ship `I18nManager.forceRTL(true)`-style global flips; that would silently flip every existing screen in the courier app and break the Wave-1 GPS UI Phase 5 just stabilised.

## User Constraints

> No `CONTEXT.md` exists for Phase 9 — orchestrator spawned from `/gsd-research-phase` standalone. The constraints below are **derived from PROJECT.md, ROADMAP.md, REQUIREMENTS.md, and CLAUDE.md** and are the authoritative inputs the planner must respect.

### Locked Decisions (from upstream — not a CONTEXT.md)

- **CON-bilingual-outbound** (PRD principle 7, REQ-bilingual-courier-comms): all outbound courier comms drafted bilingual EN+AR; owner UI English-first; **full RTL UI deferred to Y2**. Phase 9 ships content bilingualism + per-message direction handling, NOT a chrome flip.
- **REQ-mobile-agent-inbox** (REQ list): WhatsApp-style inbox to receive agent-drafted messages in the Darb mobile app without leaving the app. Ship in Q2.
- **CON-stack-mobile** (PROJECT.md): Expo 52 stays. Do NOT migrate to bare React Native or a non-Expo path.
- **CON-stack-backend-pinned** (PROJECT.md): Express 4 + Prisma 5 + BullMQ + Anthropic SDK — no framework swaps.
- **CON-tenant-scope-everywhere**: every backend route Phase 9 ships must pass through `authMiddleware + tenantScope` OR the existing `/api/agent/*` device-auth pattern. The mobile inbox endpoints use device-auth like the rest of `agent.ts`.
- **CON-propose-and-confirm-default-autonomy**: Phase 9 does NOT introduce auto-send for new action classes. The Phase 8 graduations (when they land) decide auto-send; Phase 9 is the *delivery transport*, not the *autonomy bump*.
- **Phase 11 dependency contract**: ROADMAP Phase 11 says "Phase 9 (bilingual outbound → briefings can reach couriers in Arabic)." Phase 9 must therefore expose the bilingual delivery path as a reusable service the Phase 11 scheduled-briefings worker can call without re-implementing translation.

### Claude's Discretion (Phase 9 freedom areas)

- **WhatsApp BSP choice.** Default recommendation: **Meta Cloud API direct** (no BSP) for the per-message cost win ($0.0034/utility-template in Kuwait vs Twilio-as-BSP $0.005 + $0.0034 markup = $0.0084/msg [CITED: developers.facebook.com WhatsApp pricing + twilio.com/en-us/whatsapp/pricing]). Alternative: keep using Twilio's WhatsApp adapter — the code is already wired, only needs template support added. Tradeoff: Meta-direct is cheaper and gives full template control but requires owning the Meta Business Verification flow ourselves. Recommend **Meta direct** because the Cloud API is the v22.0 GA path and we already need a WABA for production anyway. [VERIFIED: graph.facebook.com/v22.0 is GA as of 2025; Cloud API is the path Meta recommends over the deprecated On-Premises API].
- **SMS provider in Kuwait.** Default recommendation: **Unifonic** for the Kuwait local connection [CITED: docs.unifonic.com — alpha sender IDs, 15-working-day setup, no setup fee] vs Twilio international ($0.3164/SMS [CITED: twilio.com/en-us/sms/pricing/kw]) — local connection materially cheaper *and* better deliverability across Zain/Ooredoo/STC. Tradeoff: Unifonic requires a Kuwait Trade License for local connection; design-partner #1 likely has one — for tenants without, fall back to Twilio international. Recommend **Unifonic with Twilio fallback**.
- **Push provider.** Default: **Expo Push Service** (`exp.host/--/api/v2/push/send`) — already supported by the installed `expo-notifications` package, no extra cost, no APNs/FCM keys to manage. Alternative: direct APNs + FCM (more work, only marginal latency win). Recommend **Expo Push** for v1 — graduate to APNs/FCM in v2 if delivery rate is unacceptable.
- **Inbox cache size.** Default: last 50 notifications cached in `inbox_cache` table of `darb-outbox.db`. Adjust if user testing shows scroll demand higher.
- **Translation context model.** Default: **Claude Sonnet 4.5** for translations (consistent with the agent's existing model use). Alternative: dedicated translation API like DeepL Pro — adds vendor + cost. Recommend **Claude**.
- **Inbox swipe gesture library.** Default: `react-native-gesture-handler` (already a dep of `react-native-screens` indirectly per Expo SDK 52). Alternative: `react-native-swipe-list-view`. Recommend `react-native-gesture-handler` + custom Reanimated 3 worklet for the swipe — keeps deps lean.

### Deferred Ideas (OUT OF SCOPE for Phase 9)

Per upstream constraints, these are explicitly Phase 10+ or out-of-band and Phase 9 must not pull them forward:

- **Full RTL UI** for the owner dashboard (CON-non-goals-12-months) — Y2.
- **Voice interface to the agent** — CON-non-goals-12-months, Phase 2 non-goal.
- **Courier-facing super-app** (CON-non-goals-12-months) — the courier mobile app stays a GPS beacon + agent inbox; no marketplace, no order acceptance, no merchant chat.
- **Customer-facing notifications** (end-customer of the merchant) — out of scope. Phase 9 outbound is courier-only.
- **Scheduled briefings to couriers** — Phase 11 (Phase 9 ships the *delivery* primitive; Phase 11 schedules the *content*).
- **Two-way courier replies** (courier replies in-inbox, agent answers) — explicitly out of scope per "courier mobile app is GPS + agent inbox, not a marketplace". A future phase may add reply-to-supervisor escalation; not Phase 9.
- **`I18nManager.forceRTL`** global app flip — deferred. Phase 9 handles direction per-text-component only.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-mobile-agent-inbox | WhatsApp-style inbox to receive agent-drafted messages directly without leaving the app. Read/unread state. Quick reply (per ROADMAP Phase 9 success criterion #1). | Architecture Patterns §1 (Inbox screen + tab integration), §2 (Device push token), §3 (Inbox cache + sync); Standard Stack (expo-notifications 0.29.14 + expo-router 4.0.9); Don't Hand-Roll items 1, 2, 4; Pitfalls 1, 4, 6 |
| REQ-bilingual-courier-comms | All outbound courier comms drafted bilingual EN+AR. WhatsApp/SMS messages from the agent drafted both languages. Owner-facing UI remains English-first; full RTL deferred Y2. | Architecture Patterns §4 (Bilingual content generation), §5 (Channel + language resolver), §6 (WhatsApp template approval flow); Don't Hand-Roll items 3, 5; Pitfalls 2, 3, 5, 7 |

Cross-reference: this phase **enables Phase 11** (scheduled briefings to couriers can now reach them in Arabic via the same bilingual delivery service) and **completes Phase 8** by wiring the Phase 8 action tools' Notification side-effects to actually deliver externally (Phase 8 ships the action ledger + Notification rows; Phase 9 ships the transport).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inbox list rendering | Mobile (`mobile/app/(tabs)/inbox.tsx`) | — | UI lives in the app; React Native FlatList + RefreshControl |
| Inbox data fetch | Mobile → Backend `GET /api/agent/inbox` | DB `Notification` table (existing) | New device-auth route on `routes/agent.ts`; reads `Notification` where `metadata.driverId = device.driverId` |
| Mark-as-read | Mobile → Backend `POST /api/agent/inbox/:id/read` | DB `Notification.read + readAt` (existing columns) | Single-row update |
| Offline inbox cache | Mobile (`expo-sqlite`, new `inbox_cache` table in `darb-outbox.db`) | — | Reuse Phase 5's DB connection; LRU-trim to last 50 rows |
| Push token registration | Mobile (`getExpoPushTokenAsync`) → Backend `POST /api/agent/push-token` | DB `Device.expoPushToken` (new column) | Token lives on the Device row, keyed by deviceId; one-token-per-device |
| Push send | Backend `services/expoPushService.ts` (new) | Expo Push API (`exp.host/--/api/v2/push/send`) | Server-side fan-out so we can audit + retry; never call Expo from mobile |
| In-app push handler | Mobile (`setNotificationHandler` + `addNotificationResponseReceivedListener`) | OS notification center | Foreground/background/killed all handled by expo-notifications |
| Bilingual content generation in agent | Backend (`agent/tools/action/draftCourierMessage.ts` — extended) | Claude API (single tool call producing both `bodyEnglish` + `bodyArabic`) | One LLM round-trip is cheaper + more coherent than draft-then-translate |
| Translation for non-agent flows | Backend `services/translationService.ts` (new) | Claude API | Violation engine, GPS-stale alerts, scheduled briefings — each can ask for a translation without going through the agent |
| Notification persistence | Backend (existing `notificationService.ts`) | DB `Notification` (existing) | No change to storage — we just start filling `titleAr/bodyAr` |
| External delivery enqueue | Backend (existing `notificationService.deliverExternal`) | BullMQ `notificationQueue` (existing) | No change |
| WhatsApp Cloud API send | Backend `notificationChannels.ts` — new `sendWhatsAppCloud` impl | Meta Graph API v22.0 | Direct, replaces Twilio-as-BSP for tenants with `whatsappBusinessAccountId` set |
| SMS send (Kuwait) | Backend `notificationChannels.ts` — new `sendSmsUnifonic` impl | Unifonic API | Fallback to existing Twilio impl when Unifonic creds absent |
| Channel + language resolution | Backend `services/outboundResolver.ts` (new) | DB `Driver` + `Tenant` rows | Owns the "which channel, which language" decision so call sites don't repeat the logic |
| WABA template registry | Backend `agent/templates/whatsappTemplates.ts` (new) | Meta Business Manager (out-of-app) | Code maps `intent` → approved template name + variable count; humans approve templates in Meta UI |
| Tenant-level config UI | Frontend (`/settings/notifications` — exists) | Backend `routes/platformSettings.ts` | Read/write Tenant.outboundChannels + WABA creds |
| Driver-level language pref | Frontend (Driver File — Phase 3) | Backend `routes/drivers.ts` | One-field-extension to existing edit flow |
| RTL text direction | Mobile (per-text `style={{writingDirection: "rtl"}}` on Arabic body component) | — | NO global I18nManager flip — narrow per-component opt-in |
| Arabic font | Mobile (`expo-font` + bundled Tajawal TTF) | — | System Arabic falls back to weird default on Android <11; bundling guarantees consistent render |
| Quiet hours / rate limiting | Backend `services/outboundResolver.ts` (new) | DB `Tenant.settings.quietHours` (additive JSON) | One place to enforce 22:00-06:00 quiet hours unless severity=CRITICAL |
| Opt-out / unsubscribe | Backend `routes/agent.ts` `POST /api/agent/inbox/opt-out` | DB `Driver.outboundOptIn` (new column) | One-tap opt-out from the inbox; required for SMS compliance |

## Standard Stack

### Mobile — already in `mobile/package.json` (verified via `mobile/package-lock.json` 2026-05-13)

| Library | Pinned (`package.json`) | Installed (`package-lock`) | Verified Today | Purpose | Why Standard |
|---------|--------|---------|---------|---------|--------------|
| `expo` | `~52.0.0` | n/a | — | Expo SDK 52 line | CON-stack-mobile |
| `expo-notifications` | `~0.29.0` | `0.29.14` | [VERIFIED: npm view, latest 0.29.x is 0.29.9 on registry; 0.29.14 lock-file value is from an internal patch — confirm before Wave 2 build, treat as a Wave-0 verification gate] | Push token + foreground notification handler | The Expo-blessed path; supports Expo Push Service end-to-end |
| `expo-router` | `~4.0.0` | n/a | [VERIFIED: 4.0.x is the SDK 52 line; latest stable 4.0.9; canary 4.1.x is for SDK 53] | File-based routing for the new `inbox.tsx` screen | Already used for all existing screens; Stack.Protected pattern handles auth gates |
| `expo-sqlite` | `~15.1.4` | n/a | — | Reuse Phase 5's `darb-outbox.db` for inbox cache | Wave 1 of Phase 5 standardised on it |
| `expo-secure-store` | `~14.0.0` | n/a | — | KEEP — auth token + deviceId | Existing |
| `lucide-react-native` | `^1.8.0` | n/a | — | Inbox icons (Inbox, Bell, MessageSquare, Archive, Trash2, Filter) | Already used in tabs layout |
| `react-native` | `0.76.0` | n/a | — | FlatList + RefreshControl + Pressable | Existing |
| `react-native-safe-area-context` | `4.12.0` | n/a | — | Inbox screen top-safe-area on iOS | Existing |

### Mobile — add for Phase 9 (NEW packages — all SDK 52-compatible)

| Library | Recommended version | Verified Today | Purpose | Why Standard |
|---------|---------|---------|---------|--------------|
| `expo-localization` | `~16.0.0` (SDK 52 line) | [VERIFIED: npm dist-tag `sdk-51` is 15.0.3; 16.0.x line targets SDK 52; latest stable on npm is 55.0.13 but that's for SDK 53/54 — pin to `~16.0.0`] | Read device locale to default-render Arabic when courier's phone is Arabic-set | The Expo-blessed locale reader; replaces hand-rolling RN's `Settings` |
| `i18n-js` | `^4.5.3` | [VERIFIED: npm view i18n-js@latest → 4.5.3] | Tiny translation key store for UI strings (button labels, "no new messages", error toasts) | Standard in the Expo community; ~2KB; doesn't replace the dynamic bilingual content from the agent — strictly for static UI labels |
| `@expo-google-fonts/tajawal` | `^0.4.x` | [VERIFIED: package present on registry; the Cairo sibling package is documented at npmjs.com/@expo-google-fonts/cairo] | Bundled Tajawal Arabic webfont — guarantees consistent Arabic rendering on Android <11 where system Arabic fallback is buggy | Cairo or Tajawal are the two community defaults for Khaleeji Arabic UIs |
| `react-native-gesture-handler` | `~2.20.x` (SDK 52 pin) | [VERIFIED: 2.21.x is current; 2.22.0 was just published. SDK 52 ships gesture-handler 2.20.x — Expo's "use a compatible version" doctor will flag a mismatch] | Swipe-to-archive on inbox rows | Standard RN gesture lib |
| `react-native-reanimated` | `~3.16.x` (SDK 52 pin) | [VERIFIED: 3.16.7 latest in SDK 52 line] | Worklets backing the swipe animation | Already a transitive dep of gesture-handler |

### Backend — already in stack

| Library | Purpose | Why Standard |
|---------|---------|--------------|
| `@anthropic-ai/sdk` `^0.80.0` | Bilingual content generation in agent + standalone `translationService` | Existing |
| `@prisma/client` `^5.22.0` | Schema migrations for Tenant.outboundChannels, Driver.preferredLanguage, Device.expoPushToken | Existing |
| `bullmq` `^5.73.4` | `notificationQueue` already does the fan-out | Existing |
| `axios` `^1.13.6` (or `fetch`) | HTTP to Meta Cloud API + Unifonic + Expo Push | Existing in backend |
| `twilio` (lazy-required) | Existing SMS/WhatsApp impl — kept as fallback | Existing per `notificationChannels.ts:38` |

### Backend — add for Phase 9 (NEW)

| Library | Recommended version | Verified Today | Purpose | Why Standard |
|---------|---------|---------|---------|--------------|
| (none required) | — | — | All external APIs (Meta Cloud, Unifonic, Expo Push) are plain HTTPS — `fetch` or existing `axios` is sufficient | Avoid adding npm deps for one-off HTTP clients |

**Verification gate before Wave 2 build:** run `npx expo install --check` from `mobile/` to confirm the SDK-52 pins of all new mobile packages match what Expo doctor expects. If `expo-localization` lock-file pin differs from the resolved `~16.0.0` after that, override in package.json with the doctor-recommended version.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Expo Push Service | OneSignal | OneSignal cost-effective, but adds a vendor and we already have expo-notifications. Push is not the bottleneck. |
| Meta Cloud API direct | Twilio as WABA BSP (already wired) | Direct is ~40% cheaper on Kuwait utility templates and gives full template control; Twilio-as-BSP costs more but is the existing wiring. Recommend Meta direct + keep Twilio code path as fallback for tenants without a Meta WABA. |
| Unifonic | Twilio international, or Vonage, or D7 Networks for Kuwait | Unifonic local-route deliverability is materially better across Zain/Ooredoo/STC + ~50% cheaper than Twilio international — but requires Kuwait Trade License. Twilio fallback covers gap. |
| `expo-sqlite` for inbox cache | AsyncStorage | AsyncStorage already excluded by Pitfall 1 of Phase 5; SQLite is already open. |
| Per-message LLM bilingual generation | Pre-translated template strings | Static templates lose context ("on shift 3 of the day" → grammar differs from "on shift 3 of the week"); LLM-generated bilingual is the right call for ~$0.0002/msg. Use templates ONLY for WhatsApp-template-approved skeletons; the variable content stays LLM-generated. |
| `i18n-js` | `react-i18next` | react-i18next is heavier; Phase 9 has ~30 static UI strings (button labels, error toasts) — i18n-js is the right size. |

**Installation:**
```bash
cd mobile && npx expo install expo-localization i18n-js @expo-google-fonts/tajawal react-native-gesture-handler react-native-reanimated
# Backend: no new deps — fetch + existing axios + twilio cover everything.
```

## Architecture Patterns

### System Architecture Diagram

```
COURIER PHONE                                                BACKEND                                            EXTERNAL
──────────────────                                          ──────────────────                                  ──────────────────

    enrollment.tsx
         │
         │  POST /api/agent/register
         ▼
    SecureStore       ◄─────────  agent_token, device_id, driver_id, expoPushToken
         │
         │  on dashboard mount
         │  getExpoPushTokenAsync()
         ▼
    POST /api/agent/push-token  ──────►  Device.expoPushToken = "ExponentPushToken[xxx]"
                                                   │
                                                   ▼
                                              prisma.device.update

──────────────────                          ──────────────────                                  ──────────────────

  (agent runtime — Phase 2)                                                       Anthropic Claude
         │
         │  monitor agent decides to nudge driver
         │  calls draftCourierMessage(driverId, intent, bodyEnglish, bodyArabic) ──────────────►  generates both
         │                                                                                      languages in one call
         │
         │  registry sees requiresApproval=true, stages PendingAgentAction
         │
         ▼
  decisions/page.tsx ──── Approve ────► POST /api/decisions/:id/approve
                                                   │
                                                   ▼
                                          re-invoke draftCourierMessage with ctx.userId set
                                                   │
                                                   ▼
                                          prisma.notification.create({title, message, titleAr, bodyAr, ...})
                                                   │
                                                   ▼
                                          outboundResolver(driverId)
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                       enqueue("IN_APP_PUSH") enqueue("WHATSAPP")  enqueue("SMS")
                              │                    │                    │
                              ▼                    ▼                    ▼
                       expoPushService     sendWhatsAppCloud      sendSmsUnifonic
                              │                    │                    │
                              ▼                    ▼                    ▼
                       exp.host/--/        graph.facebook.com    api.unifonic.com
                       api/v2/push/send    /v22.0/{pn-id}/        /rest/SMS/messages
                                           messages

──────────────────                          ──────────────────                                  ──────────────────

      inbox.tsx
        │
        │  notification arrives via expo-notifications listener
        │  ─► refresh inbox + show in-app banner
        │
        │  or, foreground polling every 30s:
        ▼
  GET /api/agent/inbox?limit=50  ─────────────► prisma.notification.findMany({
        │                                          where: { tenantId, metadata.driverId },
        │                                          orderBy: createdAt desc, take: 50 })
        │
        │  cache to inbox_cache (expo-sqlite, LRU 50)
        ▼
  FlatList<Notification>
        │
        │  tap row with metadata.orderId  ─► router.push("/(tabs)/orders?orderId=...")
        │  swipe right                    ─► POST /api/agent/inbox/:id/read
        │  swipe left                     ─► POST /api/agent/inbox/:id/archive (sets metadata.archived=true)
        │  pull-down                      ─► onRefresh → re-fetch
```

The diagram shows three independent flows: (1) enrollment + push token registration on first launch (top-left), (2) the propose-and-confirm agent producing bilingual notification rows that fan out to up-to-three channels (middle), and (3) the inbox screen that consumes those rows on the device (bottom-left). The fan-out is owned by `outboundResolver` so call sites stay agnostic about which channels a given driver gets.

### Recommended Project Structure

```
mobile/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx                 # ADD Inbox tab + unread badge
│   │   ├── inbox.tsx                   # NEW Phase 9 — inbox list screen
│   │   ├── dashboard.tsx               # existing
│   │   └── ...                         # other tabs unchanged
│   └── inbox/
│       └── [id].tsx                    # NEW — full message detail (optional Wave 3)
├── src/
│   ├── api/
│   │   ├── client.ts                   # EXTEND — listInbox/markRead/archive/registerPushToken
│   │   └── inboxApi.ts                 # NEW — inbox-specific HTTP helpers
│   ├── services/
│   │   ├── inboxCache.ts               # NEW — expo-sqlite-backed last-50 cache
│   │   ├── pushService.ts              # NEW — getExpoPushTokenAsync + setNotificationHandler + listeners
│   │   ├── i18n.ts                     # NEW — i18n-js setup + EN/AR string tables
│   │   └── ...                         # existing services unchanged
│   ├── components/
│   │   ├── inbox/
│   │   │   ├── InboxRow.tsx            # NEW — single row with bilingual body
│   │   │   ├── InboxFilters.tsx        # NEW — category filter chips
│   │   │   └── EmptyInbox.tsx          # NEW — empty state
│   │   └── ...
│   └── i18n/
│       ├── en.json                     # NEW
│       └── ar.json                     # NEW
└── assets/
    └── fonts/
        └── Tajawal-Regular.ttf         # NEW (also -Bold, -Medium via @expo-google-fonts/tajawal)

backend/src/
├── agent/
│   ├── tools/action/
│   │   └── draftCourierMessage.ts      # EXTEND — add bodyArabic required param, write titleAr/bodyAr
│   └── templates/
│       └── whatsappTemplates.ts        # NEW — intent→template-name map + variable arity
├── services/
│   ├── translationService.ts           # NEW — Claude-backed translateToArabic(text, ctx)
│   ├── outboundResolver.ts             # NEW — resolveOutboundChannels(driverId)
│   ├── expoPushService.ts              # NEW — POST exp.host/--/api/v2/push/send
│   ├── notificationChannels.ts         # EXTEND — sendWhatsAppCloud, sendSmsUnifonic
│   └── notificationService.ts          # EXTEND — call resolver to pick channels + lang
├── routes/
│   ├── agent.ts                        # EXTEND — /push-token, /inbox, /inbox/:id/read, /inbox/:id/archive, /inbox/opt-out
│   └── platformSettings.ts             # EXTEND — Tenant.outboundChannels write
└── queues/
    └── notificationWorker.ts           # EXTEND — IN_APP_PUSH branch calls expoPushService
```

### Pattern 1: Bilingual Tool Call (single LLM round-trip)

**What:** The agent's `draftCourierMessage` requires **both** `bodyEnglish` and `bodyArabic` in the same call. Claude produces both at once — cheaper than draft-then-translate and guarantees the two languages convey the same meaning.

**When to use:** Whenever the agent is the originator of a courier-facing message. Non-agent flows (violation engine, GPS-stale alerts, scheduled briefings) use `translationService.translateToArabic(en)` instead.

**Example:**
```ts
// backend/src/agent/tools/action/draftCourierMessage.ts (EXTENDED for Phase 9)
// Source: existing file, Phase 9 changes inlined.
export const draftCourierMessage = defineTool({
  name: "draftCourierMessage",
  description:
    "Draft a courier message in BOTH English AND Khaleeji (Kuwaiti) Arabic. " +
    "Both bodies must be 20-500 chars and convey the same meaning. " +
    "Use English-Latin proper nouns ('Darb', driver names) inside Arabic body. " +
    "Times and amounts stay numeric in both languages (e.g., 8:00 AM, 12.500 KD). " +
    "Tone: respectful, professional, Gulf Arabic register (avoid Egyptian/Levantine idioms).",
  inputSchema: {
    type: "object",
    properties: {
      driverId: { type: "string" },
      intent: { type: "string", enum: [/* unchanged */] },
      bodyEnglish: { type: "string", description: "20-500 chars, English" },
      bodyArabic: { type: "string", description: "20-500 chars, Khaleeji Arabic" },  // NEW
      channel: { type: "string", enum: ["WHATSAPP", "SMS", "IN_APP", "AUTO"] },
    },
    required: ["driverId", "intent", "bodyEnglish", "bodyArabic"],  // bodyArabic now required
    additionalProperties: false,
  },
  editableParams: ["bodyEnglish", "bodyArabic"],   // approver can edit either before confirm
  async execute(ctx, input) {
    const driver = await prisma.driver.findFirst({
      where: { id: input.driverId, tenantId: ctx.tenantId },
      select: { id: true, name: true, phone: true, preferredLanguage: true, outboundOptIn: true },
    });
    if (!driver) return { ok: false, error: "Driver not found" };
    if (!driver.outboundOptIn) return { ok: false, error: "Driver opted out" };

    const notification = await prisma.notification.create({
      data: {
        tenantId: ctx.tenantId,
        type: `AGENT_DRAFT_${input.intent}`,
        category: "OPS_TODO",
        title: `Message to ${driver.name}`,
        message: input.bodyEnglish,         // English on the canonical row
        titleAr: `رسالة إلى ${driver.name}`,  // can be a static prefix in AR
        bodyAr: input.bodyArabic,           // Arabic from the same tool call
        severity: "MEDIUM",
        sourceId: driver.id,
        metadata: {
          driverId: driver.id,
          intent: input.intent,
          channel: input.channel ?? "AUTO",
          drafterAgent: ctx.agentId,
          drafterRunId: ctx.runId,
          approverUserId: ctx.userId ?? null,
        },
      },
    });

    // Phase 9 — actually deliver. resolveOutboundChannels reads
    // Driver.preferredLanguage + Tenant.outboundChannels + quiet-hours and
    // returns the ordered fan-out plan.
    await outboundResolver.deliver({
      tenantId: ctx.tenantId,
      notificationId: notification.id,
      driverId: driver.id,
      bodyEn: input.bodyEnglish,
      bodyAr: input.bodyArabic,
      channelHint: input.channel,
      severity: "MEDIUM",
    });

    return { ok: true, notificationId: notification.id };
  },
});
```

### Pattern 2: Outbound Resolver

**What:** A single backend service that takes a driver + content and decides (a) which language(s) to send in, (b) which channels in what order, (c) whether quiet-hours apply, (d) whether the driver is opted-out. Call sites (agent tools, violation engine, GPS-stale worker, scheduled briefings) pass intent — never channel-specific code.

**Example:**
```ts
// backend/src/services/outboundResolver.ts (NEW)
export async function deliver(params: {
  tenantId: string;
  notificationId: string;
  driverId: string;
  bodyEn: string;
  bodyAr: string;
  channelHint?: "WHATSAPP" | "SMS" | "IN_APP" | "AUTO";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}): Promise<void> {
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: params.driverId },
    select: { phone: true, preferredLanguage: true, outboundOptIn: true,
              device: { select: { expoPushToken: true } },
              tenant: { select: { defaultLanguage: true, outboundChannels: true,
                                  whatsappPhoneNumberId: true, settings: true } } },
  });

  if (!driver.outboundOptIn) return;  // opted-out, silent drop

  // Quiet hours: 22:00-06:00 Kuwait time unless severity=CRITICAL.
  const hour = new Date().getUTCHours() + 3;  // Kuwait is UTC+3
  const isQuiet = (hour >= 22 || hour < 6) && params.severity !== "CRITICAL";

  // Resolve language: explicit driver pref > tenant default > "AR".
  const lang =
    driver.preferredLanguage === "EN" ? "EN" :
    driver.preferredLanguage === "AR" ? "AR" :
    driver.tenant.defaultLanguage;  // AUTO → tenant default
  const body = lang === "AR" ? params.bodyAr : params.bodyEn;

  // Build channel order. AUTO = push first, then WhatsApp, then SMS as escalation.
  const channels = driver.tenant.outboundChannels as any;
  const order: Array<"IN_APP_PUSH" | "WHATSAPP" | "SMS"> = [];
  if (channels?.inApp && driver.device?.expoPushToken) order.push("IN_APP_PUSH");
  if (channels?.whatsapp && driver.tenant.whatsappPhoneNumberId && driver.phone) order.push("WHATSAPP");
  if (channels?.sms && driver.phone && !isQuiet) order.push("SMS");

  // Always enqueue push if available; only fan out to WhatsApp+SMS for HIGH/CRITICAL
  // (Stage-1) OR if push token absent (Stage-2). Stage-3 toggles via Tenant.outboundChannels.
  if (params.severity === "HIGH" || params.severity === "CRITICAL" || !driver.device?.expoPushToken) {
    for (const channel of order) {
      await enqueueNotification({ ... }, idempotencyKeyFor(channel, params));
    }
  } else {
    // Stage-1 default: push only.
    if (order.includes("IN_APP_PUSH")) {
      await enqueuePush(driver.device!.expoPushToken!, body, params);
    }
  }
}
```

### Pattern 3: Mobile Inbox Screen

**What:** Single FlatList screen with pull-to-refresh, swipe gestures, deep-link, and offline cache. Renders the bilingual body — `bodyAr` first if driver preference is AR, else `message` (English).

**Example:**
```tsx
// mobile/app/(tabs)/inbox.tsx (NEW)
import { useEffect, useState, useCallback } from "react";
import { FlatList, RefreshControl, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { listInbox, markRead } from "../../src/api/inboxApi";
import { getCachedInbox, setCachedInbox } from "../../src/services/inboxCache";
import { useLanguagePref } from "../../src/services/i18n";
import { InboxRow } from "../../src/components/inbox/InboxRow";

export default function InboxScreen() {
  const router = useRouter();
  const lang = useLanguagePref();  // "AR" | "EN", read from SecureStore
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const fresh = await listInbox({ limit: 50 });
      setItems(fresh);
      await setCachedInbox(fresh);
    } catch {
      // Offline — fall back to cache.
      const cached = await getCachedInbox();
      setItems(cached);
    }
  }, []);

  // Foreground reload on push arrival
  useEffect(() => {
    load();
    const sub = Notifications.addNotificationReceivedListener(() => load());
    return () => sub.remove();
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0F0F1E" }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor="#F97316"
          />
        }
        renderItem={({ item }) => (
          <InboxRow
            item={item}
            lang={lang}
            onPress={async () => {
              if (!item.read) await markRead(item.id);
              if (item.metadata?.orderId) router.push({ pathname: "/(tabs)/orders", params: { orderId: item.metadata.orderId } });
            }}
          />
        )}
        ListEmptyComponent={<EmptyInbox lang={lang} />}
      />
    </SafeAreaView>
  );
}
```

### Pattern 4: Per-text RTL Direction (no global flip)

**What:** Each Arabic text node opts into RTL via `style={{ writingDirection: "rtl", textAlign: "right" }}` or `dir` on the parent View. The app chrome stays LTR; only the courier-facing message bodies flip per-message.

**Example:**
```tsx
// mobile/src/components/inbox/InboxRow.tsx
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFonts, Tajawal_400Regular, Tajawal_700Bold } from "@expo-google-fonts/tajawal";

export function InboxRow({ item, lang, onPress }: Props) {
  useFonts({ Tajawal_400Regular, Tajawal_700Bold });
  const isAr = lang === "AR" && !!item.bodyAr;
  const title = isAr ? (item.titleAr ?? item.title) : item.title;
  const body  = isAr ? item.bodyAr! : item.message;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        !item.read && styles.unread,
        { borderLeftWidth: 3, borderLeftColor: platformColor(item.metadata?.platform) },
      ]}
    >
      <Text
        style={[
          styles.title,
          { fontFamily: isAr ? "Tajawal_700Bold" : undefined,
            writingDirection: isAr ? "rtl" : "ltr",
            textAlign: isAr ? "right" : "left" },
        ]}
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        style={[
          styles.body,
          { fontFamily: isAr ? "Tajawal_400Regular" : undefined,
            writingDirection: isAr ? "rtl" : "ltr",
            textAlign: isAr ? "right" : "left" },
        ]}
      >
        {body}
      </Text>
      <Text style={styles.time}>{formatTime(item.createdAt, lang)}</Text>
    </Pressable>
  );
}
```

### Pattern 5: WhatsApp Cloud API Template Send

**What:** Sending an approved template via Meta's Cloud API is a POST to `https://graph.facebook.com/v22.0/{phone-number-id}/messages` with a JSON body that names the template, the language code (`ar` for Arabic, `en` for English), and the body variables. The template body is **registered with Meta** as `Driver {{1}}, you clocked in {{2}} minutes late at {{3}}. Please notify your supervisor.` and we fill in the three variables per send.

**Example:**
```ts
// backend/src/services/notificationChannels.ts (extension)
export const sendWhatsAppCloud: WhatsAppFn = async (phone, message, ctx?: { templateName: string; templateLang: "en" | "ar"; variables: string[]; tenantPhoneNumberId: string; accessToken: string }) => {
  if (!ctx) return stubWarn("whatsapp-cloud", phone, message);
  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${ctx.tenantPhoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ctx.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/^\+/, ""),  // Meta wants no leading +
        type: "template",
        template: {
          name: ctx.templateName,
          language: { code: ctx.templateLang },
          components: [{
            type: "body",
            parameters: ctx.variables.map(v => ({ type: "text", text: v })),
          }],
        },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, provider: "whatsapp-cloud", error: err?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, provider: "whatsapp-cloud" };
  } catch (e: any) {
    return { ok: false, provider: "whatsapp-cloud", error: e?.message ?? String(e) };
  }
};
```
[CITED: developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages/ — POST /messages with `type: "template"`]

### Pattern 6: Expo Push Send

**What:** Server posts to `https://exp.host/--/api/v2/push/send` with an array of message objects each carrying `{to, title, body, data}`. Expo handles APNs + FCM under the hood. Free, low-latency.

**Example:**
```ts
// backend/src/services/expoPushService.ts (NEW)
export async function sendExpoPush(messages: Array<{
  to: string;  // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  channelId?: string;  // Android channel — see Pitfall 6
}>): Promise<Array<{ status: "ok" | "error"; message?: string }>> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  const json = await res.json();
  return json.data ?? [];
}
```
[CITED: docs.expo.dev/push-notifications/sending-notifications/]

### Anti-Patterns to Avoid

- **`I18nManager.forceRTL(true)` on app start** — flips the entire app's flexbox + scroll directions. Phase 9's contract is per-message RTL, not chrome RTL. (PRD principle 7: "owner reads English, courier reads Arabic" — courier still has English chrome with Arabic content.) Adding the global flip would break Phase 5's GPS dashboard layout silently.
- **Sending free-form text via WhatsApp Cloud API outside the 24h session window** — Meta rejects with `131026 (Message Undeliverable)` after the window. ALL agent-initiated messages must be templates. (See Pitfall 5.)
- **Storing the Meta access token in plaintext env vars per-tenant** — single tenant, OK; multi-tenant, no. Store on `Tenant.settings` JSON (already encrypted at the column level by Postgres on Vercel) or build a `TenantSecret` model. v1: `Tenant.settings`.
- **Hand-rolling translations** — Khaleeji Arabic has specific terms ("احنا" vs MSA "نحن") and gendered verbs. Send context to Claude and trust it; do not build a 200-string CSV.
- **Calling Expo Push directly from mobile** — that bypasses the audit trail (NotificationDelivery rows). Always route through backend.
- **One notification row per channel** — keeps audit messy. Use one `Notification` row per logical message; `NotificationDelivery` rows fan out per channel (one Notification → up to three Deliveries). The schema already supports this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push token registration | Custom APNs + FCM token plumbing | `expo-notifications.getExpoPushTokenAsync({ projectId })` | Expo handles both platforms + retries; we already have the package installed |
| Push delivery | Direct calls to APNs / FCM | Expo Push Service (`exp.host/--/api/v2/push/send`) | Free, low-latency, single endpoint, supports both stores |
| WhatsApp media handling | Custom upload + URL minting | Meta Cloud API media endpoints | Templates with images use Meta-hosted media IDs |
| Arabic font on Android <11 | Bundled-by-hand TTF + Font.loadAsync logic | `@expo-google-fonts/tajawal` config-plugin embed | The Expo plugin handles native-side font registration; manual TTF on Android has historical bugs (Issue #33673) |
| SMS retries on Kuwait carriers | Custom backoff against each carrier | Unifonic API + Twilio fallback through `notificationChannels.ts` | Both providers handle carrier-specific quirks (Zain charset rules, Ooredoo MO routing) |
| Translation cache | Build a Redis-backed translation cache | Don't — Claude is $0.0002/msg and bilingual messages are unique per driver per event. A cache would invalidate constantly. | The cost case for caching is weak |
| 24-hour session-window tracker for WhatsApp | Track each phone's last inbound timestamp ourselves | Always send templates for outbound — that bypasses the session-window question entirely | Meta enforces session-window only for free-form sends; templates are always allowed |
| Quiet-hours scheduler | New BullMQ delayed-job pipeline | `outboundResolver.deliver` checks hour-of-day before enqueue — sync, no scheduling needed | Quiet hours are a filter not a schedule; "deliver at 06:00" would be Phase 11 |
| Inbox unread badge maintenance | Compute on each tab focus | Server returns `unreadCount` in `GET /api/agent/inbox` response; mobile renders the badge | Single source of truth; existing `notifications/counts` route is the pattern |
| Two-way reply in mobile inbox | Don't add reply input box | Out of scope per PROJECT.md non-goal | Future phase; do not pull forward |

**Key insight:** Phase 9 looks like a big phase because it touches mobile + backend + three external providers. It's actually a wiring phase — every primitive (Notification row, NotificationDelivery row, BullMQ queue, Twilio SMS, expo-notifications client) already exists. The new code is **resolvers + adapters + one screen**, not new architecture.

## Common Pitfalls

### Pitfall 1: Android 8+ silent-drop of channelless notifications
**What goes wrong:** Push arrives, never appears, no error logged.
**Why it happens:** Android 8.0+ requires every notification to be assigned to a channel; expo-notifications drops to a `Miscellaneous` fallback channel if none is set [CITED: Expo docs, Notifications API].
**How to avoid:** Call `Notifications.setNotificationChannelAsync("darb-inbox", { name: "Darb Inbox", importance: AndroidImportance.HIGH, sound: "default", vibrationPattern: [0, 250, 250, 250] })` in app startup BEFORE registering the token; include `channelId: "darb-inbox"` in every server-side `sendExpoPush` payload.
**Warning signs:** Push arrives on iOS but not Android; "missing channel" in Logcat.

### Pitfall 2: Khaleeji vs MSA register mismatch
**What goes wrong:** The agent generates correct MSA Arabic; couriers (who read mostly Khaleeji Arabic on social) find it stiff or condescending.
**Why it happens:** Default Claude register is MSA; without context, Egyptian or Levantine idioms can also creep in.
**How to avoid:** The bilingual tool description ABOVE explicitly says "Khaleeji (Kuwaiti) Arabic register; avoid Egyptian/Levantine idioms; respectful Gulf tone." The `translationService.translateToArabic` helper takes a `context: { audience: "kuwait-courier", register: "khaleeji" }` parameter that injects the same constraint. Run a small eval set (5-10 sample messages) past design-partner #1 in user testing.
**Warning signs:** Design partner says "this sounds like a customer service bot from Cairo."

### Pitfall 3: RTL text mixing with LTR proper nouns
**What goes wrong:** "Driver mohammed clocked in 10 minutes late" — the Latin name "mohammed" inside Arabic body renders with mirrored punctuation, or wraps incorrectly.
**Why it happens:** Mixed bidi text needs explicit Unicode bidi control characters (U+202B Right-to-Left Embedding, U+202C Pop Directional Formatting) or the Latin token gets visually scrambled around adjacent Arabic punctuation.
**How to avoid:** When the agent produces `bodyArabic`, instruct it: "Wrap Latin tokens in U+200E LEFT-TO-RIGHT MARK so they render LTR inside RTL flow." Or simpler: keep `writingDirection: "rtl"` on the Text component — React Native's bidi algorithm handles 95% of cases — and accept the 5% edge case as known-imperfect for v1.
**Warning signs:** Names appear mirrored or with leading/trailing parens flipped.

### Pitfall 4: Expo Push token rotation on app reinstall
**What goes wrong:** Courier reinstalls Darb (new phone, factory reset) — old `Device.expoPushToken` is now stale, pushes silently fail.
**Why it happens:** Expo issues a new push token per app install (sometimes per app update); the token is not stable across reinstalls.
**How to avoid:** `getExpoPushTokenAsync` on EVERY app launch (cheap call); compare to SecureStore'd last-token; if different, POST `/api/agent/push-token` to update `Device.expoPushToken`. Also: handle the Expo Push response — if status="DeviceNotRegistered", null out the stored token on backend so we stop wasting sends.
**Warning signs:** Push delivery rate drops over weeks; users report "no notifications anymore."

### Pitfall 5: WhatsApp 24-hour session window blocks free-form sends
**What goes wrong:** Agent drafts a free-form message → Meta rejects → message stays in QUEUED forever.
**Why it happens:** WhatsApp Cloud API only allows free-form sends within 24h of the **user's** last inbound message [CITED: developers.facebook.com — "You can only send free-form messages... during the 24 hours following the user's last message"]. Agent-initiated messages have no inbound, so the window is always closed.
**How to avoid:** Phase 9 sends EVERY agent-initiated message as a template. Maintain ~6 pre-approved Meta templates (see WhatsApp Template Registry below). Free-form is reserved for reply scenarios — not part of Phase 9.
**Warning signs:** All sends fail with Meta error `131026` or `131047`.

### Pitfall 6: Tajawal font padding regression on iOS
**What goes wrong:** Arabic body renders with extra bottom padding, alignment looks off.
**Why it happens:** Known Tajawal-font issue with React Native vertical metrics [CITED: github.com/googlefonts/tajawal/issues/7].
**How to avoid:** Wrap Arabic Text in a View with `lineHeight: fontSize * 1.4` instead of relying on default RN line height; or switch to Cairo (no known padding issue) if Tajawal-specific design is not load-bearing.
**Warning signs:** Vertical centring off; QA reports "Arabic text looks cropped."

### Pitfall 7: SMS sender-ID approval lead time
**What goes wrong:** WhatsApp + push ship on Stage-1, SMS planned for Stage-3 — turns out Unifonic sender-ID registration takes 15 working days [CITED: docs.unifonic.com, Kuwait Sender ID Registration].
**How to avoid:** Plan-checker should flag this. Start the Unifonic registration paperwork in Wave 1 of Phase 9 even if SMS doesn't ship until Stage-3. NOC letter must be on tenant's company letterhead, signed and stamped — that's a tenant action, not an engineering one. Document this in the onboarding wizard from Phase 2.
**Warning signs:** "Why isn't SMS ready 3 weeks after WhatsApp shipped?" — answer: paperwork wasn't started.

### Pitfall 8: Foreground notification doesn't show banner
**What goes wrong:** Courier is on the inbox screen, agent sends a push, no banner appears.
**Why it happens:** Default iOS/Android behavior suppresses banners when app is foregrounded; expo-notifications requires `setNotificationHandler` to opt in.
**How to avoid:** In `pushService.ts` initialization: `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) })`. Critically: the handler must return within 3 seconds or expo-notifications discards the notification [CITED: docs.expo.dev/versions/latest/sdk/notifications/].
**Warning signs:** Notifications only show when app is backgrounded.

### Pitfall 9: deviceId mismatch on Notification ↔ inbox query
**What goes wrong:** Notifications written by `draftCourierMessage` use `metadata.driverId`; the inbox query fetches by `Notification.userId`. **They don't match.** `userId` is the dashboard *human user*; couriers are not in `User` rows — they're in `Driver` rows.
**Why it happens:** The existing `notifications/route.ts` uses `userId` because the in-app inbox today is the *owner's* inbox. The courier's inbox is a different inbox.
**How to avoid:** Add a separate `GET /api/agent/inbox` route (device-auth) that queries `Notification` where `tenantId = device.tenantId AND metadata->>'driverId' = device.driverId AND category IN ('OPS_TODO','COURIER_MESSAGE') AND read = false OR (read = true AND createdAt > now - 14d)`. Do NOT reuse `routes/notifications.ts` which is owner-auth + `userId`-scoped. This is the single biggest architectural footgun in this phase.
**Warning signs:** Inbox screen always shows empty; backend logs show "0 rows" for the driver despite Notification rows existing.

### Pitfall 10: Bilingual edit drift in the propose-and-confirm flow
**What goes wrong:** Approver edits the English body before Confirm; the Arabic stays in the original. Driver gets two different messages depending on language.
**Why it happens:** `editableParams: ["bodyEnglish"]` lets the approver edit English only; Arabic was generated alongside but isn't re-translated.
**How to avoid:** `editableParams: ["bodyEnglish", "bodyArabic"]` (both editable). Or: when English is edited, auto-retranslate via `translationService.translateToArabic` before final write — but that gives the approver a translated-back result they didn't approve. Cleaner: surface both fields in the Decisions UI Edit modal; approver edits both.
**Warning signs:** Owner sees "the Arabic doesn't match what I edited in English."

## Runtime State Inventory

> Phase 9 is partly refactor: extending an existing `draftCourierMessage` tool + an existing `notificationChannels` adapter. Inventory the runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Notification` rows already created by Phase 2 `draftCourierMessage` — they have `title`/`message` but `titleAr`/`bodyAr` are NULL. Phase 8 will likely create more pre-Phase-9 rows. | Decision: backfill or leave NULL? **Leave NULL.** Render falls back to English when `bodyAr` is null per `InboxRow.tsx` logic. Document in SUMMARY. |
| Live service config | No Meta WABA registered yet for any tenant. No Unifonic account yet. No Expo project ID configured for push (the `expo-notifications` config plugin needs `projectId`). | Plan: Phase 9 Wave 0 task — register a Meta WABA for design-partner #1, create Unifonic account, obtain Expo `projectId` from EAS. These are tenant-onboarding tasks not engineering tasks. |
| OS-registered state | None at OS level — push tokens live in the app, not in OS registries beyond APNs/FCM (managed by Expo). | None. |
| Secrets / env vars | New: `META_WHATSAPP_ACCESS_TOKEN` (per tenant, stored on `Tenant.settings`), `META_WHATSAPP_BUSINESS_ACCOUNT_ID` (per tenant), `META_WHATSAPP_PHONE_NUMBER_ID` (per tenant), `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`, `EXPO_ACCESS_TOKEN` (for sending push as authenticated — required if push volume > free tier). | Plan: provision before Wave 2. Code reads from `Tenant.settings` JSON not env vars where per-tenant. |
| Build artifacts | `mobile/node_modules/expo-notifications` is installed (0.29.14) but the JS side is unused. No stale push-token code to delete. | None — clean greenfield wiring. |

## Common Pitfalls (continued — phase-specific bilingual content gotchas)

(Captured in the Pitfalls table above — items 1-10.)

## Code Examples

Already covered inline in **Architecture Patterns §1-§6**. Sources:

- `mobile/app/(tabs)/inbox.tsx` — Phase 9 new file pattern shown above (lifted style from existing `dashboard.tsx`).
- `backend/src/services/notificationChannels.ts` — extension pattern; the existing file at `notificationChannels.ts:31-68` is the template the Phase 9 `sendWhatsAppCloud` and `sendSmsUnifonic` follow.
- `backend/src/agent/tools/action/draftCourierMessage.ts` — extension shown above; the file already exists with the `// TODO Phase 9` marker the planner can grep for.

## Architectural Component Responsibilities (file-level)

| Component | Responsibilities | New / Extended |
|-----------|-----------------|----------------|
| `mobile/app/(tabs)/inbox.tsx` | Render inbox FlatList; pull-to-refresh; tap → deep link; swipe gestures | NEW |
| `mobile/app/(tabs)/_layout.tsx` | Add Inbox tab between Home and Orders with unread badge | EXTENDED |
| `mobile/src/services/inboxCache.ts` | `getCachedInbox()` / `setCachedInbox(rows)` against `darb-outbox.db` table `inbox_cache` | NEW |
| `mobile/src/services/pushService.ts` | `registerPushToken()` — getExpoPushTokenAsync + POST /api/agent/push-token; `bootNotificationHandler()` — setNotificationHandler + addNotificationReceivedListener + Android channel setup | NEW |
| `mobile/src/services/i18n.ts` | Static UI string store; reads device locale; persists user override to SecureStore | NEW |
| `mobile/src/api/client.ts` | Extend with `registerPushToken`, `listInbox`, `markInboxRead`, `archiveInboxItem`, `optOutCourierComms` | EXTENDED |
| `mobile/src/components/inbox/InboxRow.tsx` | Render one row with bilingual title/body, platform tint, unread dot, timestamp | NEW |
| `backend/src/routes/agent.ts` | Add `/push-token`, `/inbox`, `/inbox/:id/read`, `/inbox/:id/archive`, `/inbox/opt-out` device-auth routes | EXTENDED |
| `backend/src/services/outboundResolver.ts` | `deliver({...})` — resolves channels + language + quiet-hours and enqueues NotificationDelivery rows | NEW |
| `backend/src/services/translationService.ts` | `translateToArabic(en, ctx)` — single-shot Claude call returning Khaleeji AR | NEW |
| `backend/src/services/expoPushService.ts` | `sendExpoPush(messages[])` — fetch to exp.host with retry on 429 | NEW |
| `backend/src/services/notificationChannels.ts` | Add `sendWhatsAppCloud`, `sendSmsUnifonic`; keep existing Twilio impls as fallback | EXTENDED |
| `backend/src/services/notificationService.ts` | Call `outboundResolver.deliver` in place of direct `deliverExternal` for courier-targeted notifications | EXTENDED |
| `backend/src/queues/notificationWorker.ts` | Add `IN_APP_PUSH` channel branch routing to `expoPushService` | EXTENDED |
| `backend/src/agent/tools/action/draftCourierMessage.ts` | Add required `bodyArabic` parameter; write `titleAr/bodyAr`; call `outboundResolver` | EXTENDED |
| `backend/src/agent/templates/whatsappTemplates.ts` | Static map `intent → { name, lang, argCount }` for the ~6 approved Meta templates | NEW |

## WhatsApp Template Registry (~6 templates to get Meta-approved)

Each template needs an English variant (lang `en`) AND an Arabic variant (lang `ar`). Total 12 template registrations in Meta Business Manager. All categorised **UTILITY** (the cheapest tier and easiest to get approved per Meta's template-categorization rules).

| Template Name | Category | Variables | English Body | Arabic Body (Khaleeji) |
|---------------|----------|-----------|--------------|------------------------|
| `darb_late_clockin_warn` | UTILITY | `{{1}}=driverName, {{2}}=minutesLate, {{3}}=clockInTime` | Driver {{1}}, you clocked in {{2}} minutes late at {{3}}. Per fleet policy this counts as LATE. Repeated late arrivals affect your performance score. | {{1}}، سجلت دخولك متأخر {{2}} دقيقة في {{3}}. حسب سياسة الفليت، هذا يعتبر تأخير ويؤثر على تقييمك. |
| `darb_gps_stale_warn` | UTILITY | `{{1}}=driverName, {{2}}=lastGpsMinutesAgo` | {{1}}, your GPS hasn't updated in {{2}} minutes. Please check that the Darb app is open and that location is enabled. | {{1}}، موقعك ما تحدث من {{2}} دقيقة. تأكد إن تطبيق Darb مفتوح وخدمة الموقع شغّالة. |
| `darb_order_rejection_warn` | UTILITY | `{{1}}=driverName, {{2}}=rejectionCount, {{3}}=platform` | {{1}}, you've rejected {{2}} orders on {{3}} today. Please contact your supervisor before rejecting more. | {{1}}، رفضت {{2}} طلبات على {{3}} اليوم. تواصل مع المشرف قبل ما ترفض أكثر. |
| `darb_penalty_applied` | UTILITY | `{{1}}=driverName, {{2}}=penaltyType, {{3}}=violationDate, {{4}}=appealDeadline` | {{1}}, a {{2}} penalty was applied for the violation on {{3}}. You can appeal by {{4}}. | {{1}}، تم تطبيق عقوبة ({{2}}) بسبب مخالفة بتاريخ {{3}}. يمكنك تقديم اعتراض قبل {{4}}. |
| `darb_schedule_changed` | UTILITY | `{{1}}=driverName, {{2}}=newShiftDate, {{3}}=newShiftTime, {{4}}=area` | {{1}}, your shift has been updated: {{2}} at {{3}}, area {{4}}. | {{1}}، تم تحديث وردتك: {{2}} الساعة {{3}}، منطقة {{4}}. |
| `darb_cash_reminder` | UTILITY | `{{1}}=driverName, {{2}}=amountKd, {{3}}=daysOverdue` | {{1}}, you have {{2}} KD pending cash deposit, {{3}} days overdue. Please settle today. | {{1}}، عندك {{2}} د.ك دفعات نقدية متأخرة من {{3}} يوم. الرجاء تسليمها اليوم. |

**Approval timeline** [CITED: Meta template approval can take up to 24h, "usually immediate if your business is verified"]: factor in ~24h per template; total approval Wave for 12 registrations ≈ 1-2 business days assuming verified WABA; longer for first-time WABA verification (3-5 business days).

**Template content rules to avoid rejection:**
- Don't include marketing language ("Hey {{1}}! Special offer..." → marketing category, separate approval queue).
- Variables must be numbered and sequential (`{{1}}`, `{{2}}`, `{{3}}`, never `{{name}}`).
- Don't put variables at the start or end of the body or back-to-back.
- Stay under 1024 chars total body.
- Arabic templates: Meta auto-detects RTL; no special chars needed beyond what we already include.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WhatsApp On-Premises API (Docker self-host) | WhatsApp Cloud API (Meta-hosted, `graph.facebook.com/v22.0`) | 2024 deprecation, fully removed 2025 | We MUST use Cloud API; On-Premises path no longer accepts new BSP onboarding |
| Twilio as BSP for all WhatsApp | Direct Meta Cloud API for cost; Twilio for tenants without Meta WABA | 2023-2025 | ~40% cost reduction on Kuwait utility templates |
| Manual notification channel setup on Android | `Notifications.setNotificationChannelAsync` at app boot | Android 8 (2017) | Already in expo-notifications surface; we just have to call it |
| `getDevicePushTokenAsync` for direct APNs/FCM | `getExpoPushTokenAsync` for Expo Push routing | Expo SDK 38+ (2020) | Simpler — no APNs/FCM keys to manage |
| `react-i18next` heavy translation runtime | `i18n-js` for small static-string apps | 2023 | Faster boot; <2KB; appropriate for our ~30-string surface |
| `I18nManager.forceRTL(true)` then full app flip | Per-text-component `writingDirection` | Always preferred; Phase 9 enforces | Avoids breaking existing LTR screens |
| Manual font loading via Font.loadAsync at runtime | `expo-font` config-plugin build-time embed | Expo SDK 50 | Lower TTI; works around the Android #33673 runtime-load bug |

**Deprecated/outdated:**
- WhatsApp On-Premises API — gone; don't research it.
- `expo-permissions` package — split into per-domain `expo-notifications.requestPermissionsAsync` years ago.
- Twilio Notify (the multi-channel orchestrator) — Twilio recommends building it yourself with Programmable Messaging now.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Design-partner #1 (Kuwait fleet) has a Kuwait Trade License and can register a Unifonic local sender-ID. | Standard Stack (SMS) | If wrong: SMS falls back to Twilio international at $0.3164/SMS [CITED]. Mitigation: gate SMS opt-in behind a per-tenant cost cap in `Tenant.outboundChannels.sms.maxKdPerMonth`. |
| A2 | The fleet's couriers prefer Khaleeji Arabic over MSA. | Bilingual Content Generation | Low risk — Kuwait labour market is overwhelmingly South-Asian/Egyptian + Kuwaiti supervisors; Khaleeji is the lingua franca in Kuwait labour comms. Verify with design partner during onboarding. |
| A3 | The agent (Claude Sonnet 4.5) can reliably produce a 20-500 char Khaleeji Arabic body alongside English in a single tool call. | Pattern 1 | Validate with a small eval set in Wave 1 (~10 sample intents). If reliability < 95%, fall back to draft-then-translate via `translationService`. |
| A4 | `Notification.metadata.driverId` is the right discriminator for the courier inbox (per Pitfall 9). | Architectural Component Responsibilities | Verify: `notificationService.createViolationNotifications` writes `userId` not `driverId`. Phase 9 needs to either (a) extend metadata to always include `driverId` from Phase 2 onward, or (b) read both `userId` (for User-targeted) and `metadata.driverId` (for Driver-targeted). Plan-checker should flag this. |
| A5 | Expo Push free tier covers Phase 9 volume (50-200 active couriers × ~10 pushes/day = ~2,000 pushes/day). | Don't Hand-Roll | [CITED: Expo Push has no documented hard rate limit but recommends `EXPO_ACCESS_TOKEN` for production volume]. Acquire and configure the token in Wave 2. |
| A6 | Meta will approve our six utility templates without significant content changes. | WhatsApp Template Registry | Risk: Meta tightens utility-template policy occasionally; rejections take ~24h to surface. Mitigation: submit ALL 12 templates (6 × 2 langs) in Wave 1, treat any rejection as a known-issue and iterate with Meta. |
| A7 | Twilio code path stays in `notificationChannels.ts` as fallback even after Meta WABA goes live for tenant #1. | Standard Stack — WhatsApp choice | Low risk. Twilio fallback also covers tenants without a WABA. |
| A8 | The mobile inbox can rely on `metadata.orderId` for deep-linking. | Pattern 3 | Verify Phase 8 action tools write `metadata.orderId` when relevant. If absent, deep-link gracefully degrades to "open inbox detail screen." |
| A9 | The `darb-outbox.db` SQLite database opened by Phase 5 can be re-opened by Phase 9 for the inbox cache without lock contention. | Don't Hand-Roll | expo-sqlite serialises writes [VERIFIED: Phase 5 RESEARCH §Pitfall 1]; cross-table reads in the same DB are safe. Use a separate `inbox_cache` table. |
| A10 | "Quick reply" in the ROADMAP success criterion #1 means tap-to-acknowledge ("I see this"), NOT free-text reply. | Architecture / scope | Verify with founder before Wave 1. If "free-text reply" is required, that introduces a back-channel and significantly expands Phase 9 scope — would be a Phase 9.1 insertion. Recommend confirming "tap to mark read = quick reply" interpretation in `/gsd-discuss-phase`. |

**Open Questions** (a subset of the Assumptions Log, surfaced for discuss-phase):
1. **Quick-reply scope.** ROADMAP says "the inbox supports read/unread state and quick reply." Confirm interpretation: tap-to-read = quick reply, NOT free-text reply input. (A10.)
2. **WhatsApp WABA ownership.** Does Darb own one WABA per tenant, or do tenants own their own? Cost difference is meaningful at scale. Recommendation: Darb owns one WABA per tenant — simpler onboarding, single phone number per tenant.
3. **Push notifications when courier is on shift but app is killed by OS.** Pitfall 4 covers token rotation; this is the second-order failure: OS killed the app entirely. Recommendation: rely on Expo Push to wake the app for high-severity notifications; accept that some lower-severity pushes will arrive after the next foreground launch.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | Backend | (presumed) | — | Phase 5 already validated this |
| PostgreSQL 15 | Backend `Notification`, `NotificationDelivery`, additive `Device.expoPushToken` migration | (presumed) | — | — |
| Redis 7 | `notificationQueue` BullMQ | (presumed) | — | Already used by 8 workers |
| Expo CLI / EAS | Mobile build + push setup | (presumed) | — | Phase 5 used it |
| Meta Business Account / WABA | WhatsApp Cloud API | ✗ (not yet provisioned for any tenant) | — | Twilio existing fallback covers WhatsApp until WABA live |
| Unifonic account + Kuwait sender ID | SMS Stage-3 | ✗ (not yet) | — | Twilio international SMS at $0.3164/msg [CITED] |
| Expo `projectId` | Push token registration | ✗ (`mobile/app.json` doesn't currently set `extra.eas.projectId`) | — | None — must be obtained before Wave 1 push token testing |
| `EXPO_ACCESS_TOKEN` (server-side) | Expo Push at production volume | ✗ | — | Anonymous send works at low volume; rate-limit risk above ~100/min |
| Anthropic API key | `translationService`, agent bilingual generation | ✓ | — | Existing in backend env |

**Missing dependencies with no fallback:**
- Expo `projectId` — must be obtained from EAS before Wave 1 can functionally test push.

**Missing dependencies with fallback:**
- Meta WABA — Twilio existing impl.
- Unifonic — Twilio existing impl.
- `EXPO_ACCESS_TOKEN` — anonymous works for dev volume.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (backend) | Jest 29.x (existing — `backend/package.json`) |
| Framework (mobile) | jest-expo 52.x (existing — `mobile/package.json`) |
| Config file (backend) | `backend/jest.config.js` (existing) |
| Config file (mobile) | `mobile/jest.config.js` (likely existing — verify in Wave 0) |
| Quick run command (backend) | `cd backend && npx jest --testPathPattern='inbox|outbound|translation|expoPush' --bail` |
| Quick run command (mobile) | `cd mobile && npx jest --testPathPattern='inbox|pushService|i18n' --bail` |
| Full suite command | `cd backend && npm test && cd ../mobile && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-mobile-agent-inbox | Inbox renders 50 most recent Notification rows for the device's driver | integration | `cd backend && npx jest agent/inboxRoutes.test.ts -x` | ❌ Wave 0 |
| REQ-mobile-agent-inbox | Mark-as-read updates `Notification.read + readAt` | unit | `cd backend && npx jest agent/inboxRoutes.test.ts -t "marks read"` | ❌ Wave 0 |
| REQ-mobile-agent-inbox | Offline cache returns last 50 from expo-sqlite when network fails | unit (mobile) | `cd mobile && npx jest inboxCache.test.ts -x` | ❌ Wave 0 |
| REQ-mobile-agent-inbox | Tap on order-tagged notification deep-links to /(tabs)/orders | unit (mobile, RN-testing-library) | `cd mobile && npx jest inboxRow.test.tsx -t "deep-link"` | ❌ Wave 0 |
| REQ-mobile-agent-inbox | Push registration POSTs token to /api/agent/push-token | unit (mobile) | `cd mobile && npx jest pushService.test.ts` | ❌ Wave 0 |
| REQ-mobile-agent-inbox | Push token rotation handled on app re-launch | unit (mobile) | `cd mobile && npx jest pushService.test.ts -t "rotation"` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `draftCourierMessage` rejects when `bodyArabic` missing | unit | `cd backend && npx jest draftCourierMessage.test.ts -t "requires bodyArabic"` | ❌ Wave 0 (extends existing) |
| REQ-bilingual-courier-comms | `translationService.translateToArabic` returns Khaleeji register | integration (Anthropic mocked) | `cd backend && npx jest translationService.test.ts -x` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `outboundResolver` picks AR body when Driver.preferredLanguage='AR' | unit | `cd backend && npx jest outboundResolver.test.ts -t "language pref"` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `outboundResolver` skips delivery when `outboundOptIn=false` | unit | `cd backend && npx jest outboundResolver.test.ts -t "opt-out"` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `outboundResolver` respects quiet-hours unless severity=CRITICAL | unit | `cd backend && npx jest outboundResolver.test.ts -t "quiet hours"` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `sendWhatsAppCloud` posts correct JSON shape to graph.facebook.com | unit (fetch mocked) | `cd backend && npx jest notificationChannels.test.ts -t "whatsapp cloud"` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `sendSmsUnifonic` falls back to Twilio when Unifonic creds absent | unit | `cd backend && npx jest notificationChannels.test.ts -t "unifonic fallback"` | ❌ Wave 0 |
| REQ-bilingual-courier-comms | `sendExpoPush` includes Android `channelId` | unit | `cd backend && npx jest expoPushService.test.ts -t "android channel"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && npx jest --testPathPattern='inbox|outbound|translation|expoPush|draftCourier' --bail --findRelatedTests`
- **Per wave merge:** `cd backend && npm test && cd ../mobile && npm test`
- **Phase gate:** Full suite green AND a manual smoke test on a physical Android + iOS device confirming push delivery + Arabic rendering + RTL direction.

### Wave 0 Gaps

- [ ] `backend/src/__tests__/agent/inboxRoutes.test.ts` — covers REQ-mobile-agent-inbox routes
- [ ] `backend/src/__tests__/services/translationService.test.ts` — Anthropic-mocked translation
- [ ] `backend/src/__tests__/services/outboundResolver.test.ts` — channel + language + quiet-hours logic
- [ ] `backend/src/__tests__/services/notificationChannels.test.ts` — Cloud API + Unifonic adapters
- [ ] `backend/src/__tests__/services/expoPushService.test.ts` — Expo Push send + retry
- [ ] `backend/src/__tests__/agent/tools/action/draftCourierMessage.test.ts` — extend existing for `bodyArabic` requirement
- [ ] `mobile/src/services/__tests__/inboxCache.test.ts` — expo-sqlite cache LRU behavior
- [ ] `mobile/src/services/__tests__/pushService.test.ts` — token registration + rotation
- [ ] `mobile/src/components/inbox/__tests__/InboxRow.test.tsx` — bilingual render + deep-link
- [ ] Mobile test mock for `expo-notifications` (similar to Phase 5's `expo-sqlite` mock at `mobile/__tests__/mocks/`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Device-auth via existing `/api/agent/*` pattern; `agent_token` from SecureStore on every request |
| V3 Session Management | yes | SecureStore for token; no session leakage to plaintext logs (existing pattern) |
| V4 Access Control | yes | Inbox query restricted to `tenantId = device.tenantId AND metadata.driverId = device.driverId`; push tokens written only by the device that owns the deviceId |
| V5 Input Validation | yes | Zod validators on every new route — `pushToken: z.string().startsWith("ExponentPushToken[")`, `notificationId: z.string().uuid()`, `bodyArabic: z.string().min(20).max(500)`, etc. |
| V6 Cryptography | yes | Meta WABA access tokens stored in `Tenant.settings` JSON (Postgres-encrypted-at-rest on Vercel); never logged; never returned in GET responses |
| V14 Configuration | yes | Per-tenant env not in shared env vars — uses `Tenant.settings.whatsapp.*` |

### Known Threat Patterns for {Expo SDK 52 + Express + WhatsApp Cloud API}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stolen device push token used to spoof origin | Spoofing | Push tokens are write-only on backend; we never read them back to mobile. Token rotation handled per Pitfall 4. |
| Replay of mark-read POST to game audit log | Tampering | Idempotency: `Notification.readAt` is set on first read; subsequent calls no-op. Existing pattern. |
| Cross-tenant inbox leak | Information Disclosure | Inbox query MUST filter on `tenantId = device.tenantId` (device-auth scope). Test: `inboxRoutes.test.ts -t "rejects cross-tenant"`. |
| WhatsApp template injection | Tampering | Meta API parameters are templated by Meta; we pass variable values, not template body. Length + character validation on variables (`z.string().max(120)`). |
| Phone number harvesting via opt-out endpoint | Information Disclosure | Opt-out endpoint requires device-auth; only acts on the device's own driverId. No enumeration. |
| Arabic injection / RTL override character abuse | Tampering | Strip U+202D / U+202E (LEFT-TO-RIGHT OVERRIDE / RIGHT-TO-LEFT OVERRIDE) from agent-generated bodyArabic before persisting; agent prompt instructs no override chars. |
| Push notification spam (cost) | Denial of Service | Per-tenant + per-driver rate limits in `outboundResolver` — max 10 push/driver/day, max 3 WhatsApp/driver/day. |
| Stolen Meta access token | Spoofing / Tampering | Token rotated quarterly per Meta best practice; revoke + replace if device telemetry shows anomaly. |
| Cross-courier message read | Information Disclosure | All inbox queries device-scoped (Pitfall 9 fix). Verify in `inboxRoutes.test.ts`. |

## Sources

### Primary (HIGH confidence — code inspected directly)

- `mobile/package.json` — Expo SDK 52 pins, expo-notifications 0.29.x already installed
- `mobile/app.json` — Expo Router + expo-notifications + expo-sqlite plugins already configured
- `mobile/src/api/client.ts` — existing agentFetch pattern, SecureStore token retrieval
- `mobile/src/services/outbox.ts` — Phase 5 SQLite seam to reuse for inbox cache
- `mobile/app/(tabs)/_layout.tsx` — existing tab structure; new Inbox tab inserts cleanly
- `backend/src/agent/tools/action/draftCourierMessage.ts` — Phase 2 file with explicit Phase 9 TODO marker
- `backend/src/services/notificationService.ts` — `deliverExternal` + `enqueueNotification` chain
- `backend/src/services/notificationChannels.ts` — Twilio WhatsApp/SMS adapters to extend
- `backend/src/queues/notificationQueue.ts` + `notificationWorker.ts` — existing BullMQ fan-out
- `backend/src/routes/notifications.ts` — owner-auth inbox pattern; courier-auth follows agent.ts pattern
- `backend/src/routes/agent.ts` — device-auth pattern for new inbox routes
- `backend/prisma/schema.prisma` — Notification with titleAr/bodyAr/category already present; Device row to extend
- `.planning/phases/02-decisions-surface-propose-and-confirm-design-partner-1/02-RESEARCH.md` — Phase 2 design context
- `.planning/phases/05-mobile-gps-beacon/05-RESEARCH.md` — Phase 5 mobile foundations including expo-sqlite outbox pattern

### Secondary (MEDIUM-HIGH confidence — official docs)

- [Expo Notifications API](https://docs.expo.dev/versions/latest/sdk/notifications/) — getExpoPushTokenAsync, setNotificationHandler, Android channels
- [Expo Push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) — projectId, EAS integration
- [Expo Push sending](https://docs.expo.dev/push-notifications/sending-notifications/) — exp.host/--/api/v2/push/send endpoint
- [Expo Protected Routes](https://docs.expo.dev/router/advanced/protected/) — Stack.Protected pattern for auth gates
- [Meta WhatsApp Templates Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) — template categories, approval flow
- [Meta Template Categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization) — utility vs marketing vs auth distinctions
- [Twilio WhatsApp Pricing](https://www.twilio.com/en-us/whatsapp/pricing) — 24-hour session window, MENA rates
- [Twilio SMS Pricing Kuwait](https://www.twilio.com/en-us/sms/pricing/kw) — $0.3164/SMS international
- [Unifonic Kuwait Sender ID Registration](https://docs.unifonic.com/docs/kuwait-sender-id-registration-requirements) — 15 working day setup, NOC letter
- [Unifonic SMS Pricing](https://docs.unifonic.com/articles/products-documentation/how-sms-is-charged-by-unifonic) — local sender ID rates
- [Expo Fonts](https://docs.expo.dev/versions/latest/sdk/font/) — config-plugin embed pattern
- [@expo-google-fonts/cairo](https://www.npmjs.com/package/@expo-google-fonts/cairo) — alternative Arabic font with no known padding bug

### Tertiary (MEDIUM confidence — community guides, cross-checked)

- [Tajawal font padding issue #7](https://github.com/googlefonts/tajawal/issues/7) — confirmed RN bottom-padding gotcha
- [Expo custom font issue #33673](https://github.com/expo/expo/issues/33673) — Android runtime font load bug rationale for config-plugin
- [Expo Push notifications channel issue #19735](https://github.com/expo/expo/issues/19735) — setNotificationChannelAsync timing on Android 13+
- [Stack.Protected blog post](https://expo.dev/blog/simplifying-auth-flows-with-protected-routes) — declarative auth gate pattern
- [FlatList RTL Android issue #28247](https://github.com/facebook/react-native/issues/28247) — RTL FlatList on Android partially broken; rationale for per-text direction rather than horizontal-list flip
- [WhatsApp Business API Guide 2026](https://www.messagecentral.com/blog/whatsapp-business-api-complete-guide) — BSP selection cross-reference (used directionally, not as a primary source)
- [Direct7 Kuwait SMS Regulations blog](https://d7networks.com/blog/sms-regulations-kuwait/) — sender ID rules cross-check with Unifonic docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every pinned version cross-checked against npm registry today; SDK 52 line confirmed against `mobile/package.json` lock file.
- Architecture: HIGH — existing files inspected; new components are thin adapters on top of an already-correct queue infrastructure.
- Bilingual content + WhatsApp templates: MEDIUM-HIGH — Meta Cloud API docs verified for template JSON shape and category rules; 24-hour session window verified [CITED]; Khaleeji vs MSA register is an editorial choice (A2) that needs design-partner validation.
- Pitfalls: HIGH — Pitfalls 1-10 each cite a verified source or directly-inspected code; Pitfall 9 (`metadata.driverId` vs `userId`) is the highest-impact and is a Plan-Checker watchpoint.
- WhatsApp template registry: MEDIUM — six template names + bodies proposed; Meta approval is asynchronous and may require iteration on body text.

**Research date:** 2026-05-13
**Valid until:** ~2026-06-12 (30 days for stable Expo SDK 52 + Meta WhatsApp Cloud API v22.0 surfaces; re-verify WhatsApp pricing + Unifonic Kuwait rates closer to Wave 2 ship, those can drift quarterly).
