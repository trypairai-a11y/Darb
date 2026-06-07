---
phase: 05-mobile-gps-beacon
plan: 03
subsystem: mobile-gps-beacon
tags: [mobile, ux, permission-rationale, battery-badge, delivery-photo, camera, platform-guess, wave-3]
requires:
  - "mobile/src/services/photoService.ts (Wave 1)"
  - "mobile/src/services/heartbeatService.ts (Wave 1)"
  - "mobile/src/services/locationService.ts startBeacon/stopBeacon (Wave 1)"
  - "mobile/src/services/platformGuess.ts setLastTab (Wave 1)"
  - "mobile/src/api/client.ts requestUploadUrl + recordDeliveryPhotoMetadata (Wave 1)"
  - "POST /api/agent/upload-url + POST /api/agent/delivery-photo (Wave 2)"
provides:
  - "mobile/src/components/PermissionRationale.tsx — two-stage rationale modal before OS permission dialogs"
  - "mobile/src/components/BatteryStatusBadge.tsx — beacon health + battery percent header chip"
  - "mobile/__tests__/photoService.endToEnd.test.ts — pins compress→presign→PUT→metadata interaction order"
  - "dashboard.tsx Start Shift → PermissionRationale → startBeacon flow"
  - "orders.tsx Mark Delivered → CameraView modal → uploadDeliveryPhoto flow"
  - "dashboard.tsx 5-min heartbeat loop via heartbeatService.sendHeartbeat"
  - "orders.tsx + _layout.tsx setLastTab on tab focus + cold-start"
affects:
  - "mobile/app/(tabs)/dashboard.tsx — full rewrite of heartbeat + Start Shift code paths"
  - "mobile/app/(tabs)/orders.tsx — added Mark Delivered button + camera modal + uploadDeliveryPhoto + useFocusEffect setLastTab"
  - "mobile/app/_layout.tsx — added cold-start setLastTab(driverPlatform)"
tech-stack:
  added: []
  patterns:
    - "Two-stage permission rationale modal (explain → fg-asking → bg-explain → bg-asking)"
    - "Beacon-health state ('active'|'paused'|'error') wired to BatteryStatusBadge color"
    - "RN-conventional `body: { uri, name, type }` for binary PUT (single fetch, no Blob round-trip)"
    - "useFocusEffect-driven setLastTab refresh on per-screen tab focus"
    - "Camera capture via fullscreen Modal hosting CameraView (mirrors selfie.tsx pattern)"
key-files:
  created:
    - "mobile/src/components/PermissionRationale.tsx"
    - "mobile/src/components/BatteryStatusBadge.tsx"
    - "mobile/__tests__/photoService.endToEnd.test.ts"
  modified:
    - "mobile/app/(tabs)/dashboard.tsx"
    - "mobile/app/(tabs)/orders.tsx"
    - "mobile/app/_layout.tsx"
decisions:
  - "photoService.endToEnd.test.ts pins the SHIPPED Wave 1 single-fetch impl (body: {uri,name,type}) rather than the plan recipe's blob-via-fetch two-fetch variant. The Wave 1 SUMMARY's decision key already locks the RN-conventional pattern; rewriting it for the test would break Wave 0 photoService.uploadDirect.test.ts which assumes a single fetch."
  - "PermissionRationale.askBackground delegates to startBeacon() rather than calling Location.requestBackgroundPermissionsAsync() inline. This keeps the post-grant happy path atomic (perm + TaskManager registration land together)."
  - "BatteryStatusBadge color semantics: green=active, orange=paused, red=error. Matches the StatusBadge palette used elsewhere in the app + the platform-tone the existing dashboard uses for shift state."
  - "Heartbeat cadence dropped 15min → 5min in dashboard.tsx per RESEARCH.md system-architecture diagram. 5-min gives the backend's battery-DoS detector enough resolution to flag a misbehaving app within one shift segment."
  - "setLastTab refresh runs on Orders tab focus AND cold-start (root _layout.tsx useEffect). Without the cold-start tick, the first GPS upload after launch ships with platformGuess=null — backend tier-3 attribution silently degrades."
  - "Mark Delivered Camera capture uses base64:false (URI-only). Wave 1 photoService streams via RN binary upload; base64 here would double JS-heap usage during compress."
metrics:
  duration: "~5 minutes"
  completed: "2026-05-13"
  files_created: 3
  files_modified: 3
  tests_added: 3
  tests_turned_green: "+3 (15 → 18; suites 10 → 11; no regressions)"
---

# Phase 5 Plan 03: Wave 3 Mobile UX (PermissionRationale + BatteryStatusBadge + Delivery Photo Wiring) Summary

Wave 3 surfaces the Wave 1 mechanics to the courier. Mechanics that worked but were invisible
in v0 (real battery telemetry, durable GPS outbox, presigned-URL photo upload) are now
attached to the UI flows couriers actually drive: Start Shift, Mark Delivered, tab navigation.

## Wave 3 Deliverables

### 2 new components (174 lines)

| File | Lines | Provides |
|---|---|---|
| `mobile/src/components/PermissionRationale.tsx` | 117 | Two-stage rationale modal (explain → fg-asking → bg-explain → bg-asking) |
| `mobile/src/components/BatteryStatusBadge.tsx` | 75 | Header chip: beacon health (active/paused/error) + battery % + LP-mode flag |

### 1 new test (151 lines, 3 cases)

| File | Cases | Coverage |
|---|---|---|
| `mobile/__tests__/photoService.endToEnd.test.ts` | 3 | Interaction order; non-2xx PUT short-circuits metadata; presign-error propagation |

### 3 modified screens

| File | Change |
|---|---|
| `mobile/app/(tabs)/dashboard.tsx` | Replace startTracking → startBeacon; replace 15-min hardcoded heartbeat → 5-min sendHeartbeat; mount PermissionRationale on Start Shift; render BatteryStatusBadge in header |
| `mobile/app/(tabs)/orders.tsx` | Add Mark Delivered button + CameraView modal capture → uploadDeliveryPhoto; useFocusEffect setLastTab on Orders focus |
| `mobile/app/_layout.tsx` | Cold-start setLastTab(driverPlatform) from SecureStore |

## Start Shift Flow Diagram

```
Courier taps "Start Shift"
         │
         ▼
dashboard.handleToggleShift()
         │  setShowPermission(true)
         ▼
<PermissionRationale visible=true />
         │
         │  stage="explain"
         │  Title:  "Darb tracks your location during shifts"
         │  Copy:   why we track + the off-shift promise
         │  CTAs:   [Continue] [Not now]
         │
         ▼  tap Continue
askForeground()
         │  Location.requestForegroundPermissionsAsync()
         │
         ├─► denied → setStage('explain'); onComplete(false)
         │           → dashboard: setBeaconStatus('error'); Alert.alert("Permission Required")
         │
         └─► granted → setStage('bg-explain')
                  │
                  │  Title:  "One more permission"
                  │  Copy:   why bg + 'Allow All The Time' instruction
                  │  CTA:    [Got it]
                  │
                  ▼  tap Got it
              askBackground()
                  │  setStage('bg-asking') → spinner
                  │  startBeacon()   ◄── Wave 1 service
                  │     ├─► Location.requestBackgroundPermissionsAsync()
                  │     ├─► TaskManager.isTaskRegisteredAsync(...)
                  │     └─► Location.startLocationUpdatesAsync(...) with iOS bg settings
                  │
                  ├─► ok:false → onComplete(false)
                  │            → dashboard: setBeaconStatus('error'); Alert
                  │
                  └─► ok:true  → onComplete(true)
                              → dashboard: setBeaconStatus('active'); setOnShift(true)
                              → router.push('/selfie?type=clock_in')
                              │
                              ▼
                          <BatteryStatusBadge> updates to green "GPS Active" + battery%
```

## Mark Delivered Flow Diagram

```
Courier taps "Mark Delivered" on an order card
         │
         ▼
openCameraForOrder(orderId)
         │  if (!camPermission.granted) requestCamPermission()
         │  setCameraOrderId(orderId)
         ▼
<Modal visible> hosts <CameraView ref={cameraRef} facing="back" />
         │
         ▼  tap capture button
capture()
         │  cameraRef.current.takePictureAsync({ quality: 0.9, base64: false })
         │  Location.getCurrentPositionAsync({ accuracy: High })  ◄── lat/lng for metadata
         ▼
uploadDeliveryPhoto({ orderId, uri, latitude, longitude })   ◄── Wave 1 service
         │
         │  Step 1: ImageManipulator.manipulateAsync(uri, [{resize:{width:1280}}], {compress:0.7, format:JPEG})
         │          → EXIF stripped via re-save (T-05-03-02 mitigation)
         │
         │  Step 2: requestUploadUrl({ deviceId, orderId, contentType: 'image/jpeg' })
         │          → backend issues presigned PUT URL + tenant-prefixed key
         │
         │  Step 3: fetch(presigned.url, { method:'PUT', body:{ uri,name,type }, headers:{Content-Type:'image/jpeg'} })
         │          → R2 receives bytes directly (zero Express egress)
         │          → non-2xx throws "presigned PUT failed: HTTP <status>"
         │
         │  Step 4: recordDeliveryPhotoMetadata({ deviceId, orderId, key, capturedAt, lat, lng })
         │          → backend writes OrderEvent { action: 'DELIVERY_PHOTO', ... }
         │
         ├─► throws → Alert.alert("Upload failed", err.message)   ◄── courier sees + retries
         │
         └─► resolved → Alert.alert("Photo uploaded", ...)
                       setCameraOrderId(null)   ◄── modal closes
```

## platformGuess Wiring Strategy

Per the plan, the tier-3 hint is set via per-screen `useFocusEffect` calls + a one-shot
cold-start tick in the root `_layout.tsx`. Three call sites:

| Site | When | Purpose |
|---|---|---|
| `app/_layout.tsx` `useEffect(() => …, [])` | App cold-start | Seed the hint so the first GPS upload after launch carries a non-null platformGuess |
| `app/(tabs)/orders.tsx` `useFocusEffect(...)` | Orders tab focus | Re-emit on every Orders focus → keeps the 30-min decay window fresh while the courier is actively working orders |
| (future) other tabs | Phase 5+1 follow-up | shifts/profile/tickets tabs could call setLastTab too; not in Wave 3 scope per orchestrator decision |

Source of truth: `SecureStore.getItemAsync('driver_platform')`. Set by `/api/agent/register`
response handling (Wave 1 wired `driver_id` already; `driver_platform` requires backend
to add `platform` to the register response — flagged below as a follow-up).

## Deviations from Plan

### Rule 1 — Aligned end-to-end test to shipped single-fetch photoService

**Found during:** Task 1 — writing photoService.endToEnd.test.ts

**Issue:** The plan recipe at lines 343-382 describes a two-fetch implementation
(`fetch(compressed.uri).then(blob)` + `fetch(presignedUrl, { body: blob })`) and the test
recipe asserts `mock.calls[1][0]` (second fetch's URL). The shipped Wave 1 photoService
uses the RN-conventional single-fetch pattern (`body: { uri, name, type }`). Wave 1 SUMMARY's
decisions key explicitly locks this pattern. The Wave 0 `photoService.uploadDirect.test.ts`
also assumes one fetch.

**Fix:** Wrote the end-to-end test to match the shipped single-fetch impl. The order trace
hook (`orderTrace.push('compress'|'presign'|'put'|'metadata')`) captures interaction
ordering directly instead of inferring it from fetch call indices. Assertions check that
fetch was called with the presigned URL + PUT method + image/jpeg Content-Type — without
depending on a specific call index.

**Files modified:** `mobile/__tests__/photoService.endToEnd.test.ts` (new file).

**Commit:** `ae40ff7`

**Tracked as:** Rule 1 — implementation-aligned test (the binding contract is the shipped
service; the plan prose recipe was illustrative).

### Rule 3 — beforeEach mock-resolution queue collided with in-test impl hooks

**Found during:** Task 1 first run of `npx jest photoService.endToEnd`

**Issue:** The test had `mockResolvedValueOnce` calls in `beforeEach` plus `mockImplementationOnce`
calls in the test body. The "Once" queue is FIFO — the test body's hooks landed BEHIND the
beforeEach resolutions, so the orderTrace never recorded the "compress" stamp.

**Fix:** Added `mockReset()` calls at the top of the order-tracing test to clear the queue
before adding the in-test hooks.

**Files modified:** `mobile/__tests__/photoService.endToEnd.test.ts`.

**Commit:** `ae40ff7` (same task)

**Tracked as:** Rule 3 — blocking test-setup bug, auto-fixed inline.

### Rule 2 — Added the dashboard battery refresh tick (not in plan recipe)

**Found during:** Task 2 — wiring BatteryStatusBadge

**Issue:** The plan recipe (Step 1.b) sets the initial battery once via a single
useEffect on mount. Without a refresh tick, the badge's battery % drifts further from
reality the longer the courier stays on the dashboard. For a courier on a 12-hour
shift glancing at the dashboard mid-day, the badge would still show ~95% from the
morning's launch.

**Fix:** Added a 5-min refresh loop (matching the heartbeat cadence so we don't spin
up a second timer for no reason, but keeping the loop separate so the cadences can
diverge if a future UX call wants a faster battery refresh than the telemetry cadence).

**Files modified:** `mobile/app/(tabs)/dashboard.tsx`.

**Commit:** `cfd48ec`

**Tracked as:** Rule 2 — auto-added missing critical functionality (without it the
badge UX is misleading after ~30 min).

## Test Counts: Wave 1+2 baseline → Wave 3 result

**Before Wave 3:**

```
Test Suites: 10 passed, 10 total
Tests:       15 passed, 15 total
```

**After Wave 3:**

```
Test Suites: 11 passed, 11 total
Tests:       18 passed, 18 total
Time:        ~0.7 s
```

Net change: **+3 cases, +1 suite, 0 regressions.** All Wave 0 RED tests remain GREEN.

| Suite | Cases | Status |
|---|---|---|
| `appJson.androidPermissions` | 3 | GREEN (unchanged from Wave 1) |
| `outbox.idempotency` | 1 | GREEN (unchanged) |
| `outbox.flushSemantics` | 2 | GREEN (unchanged) |
| `outbox.giveUp` | 1 | GREEN (unchanged) |
| `locationService.permissionFlow` | 2 | GREEN (unchanged) |
| `locationService.taskRegistration` | 1 | GREEN (unchanged) |
| `platformGuess.lastTab` | 2 | GREEN (unchanged) |
| `heartbeatService.battery` | 1 | GREEN (unchanged) |
| `photoService.compress` | 1 | GREEN (unchanged) |
| `photoService.uploadDirect` | 1 | GREEN (unchanged) |
| **`photoService.endToEnd`** ◄── NEW | **3** | **GREEN** |
| **Total** | **18** | **18/18 GREEN** |

## TypeScript Check

`cd mobile && npx tsc --noEmit` exits 1 with **one pre-existing error** in
`mobile/src/components/AiSuggestionFeed.tsx:21` — `Module '"../api/client"' has no
exported member 'api'`. This is unrelated to Phase 5 (AiSuggestionFeed.tsx ships an
unrelated AI surface and pre-dates the Wave 1 client refactor). All Phase 5 Wave 3
files type-check cleanly.

## Threat Surface Scan

| Threat ID | Component | Mitigation Status |
|---|---|---|
| T-05-03-01 | Photo malware upload | **Backend-mitigated** (Wave 2) — `/upload-url` validates contentType; presigned URL signed with image/jpeg ContentType so R2 rejects non-jpeg PUT |
| T-05-03-02 | EXIF metadata leak | **Mitigated** — photoService re-saves via `ImageManipulator.manipulateAsync({format: JPEG})` (Wave 1) which strips EXIF. Wave 3 doesn't change this path |
| T-05-03-03 | Permission downgrade | **Mitigated** — PermissionRationale surfaces grant failures to dashboard.tsx which sets `beaconStatus: 'error'` + Alert |
| T-05-03-04 | Photo upload races shift-end | **Accept-with-mitigation** — Wave 3 ships immediate-upload (presign + PUT inline); failures Alert the courier for manual retry. Offline-queue mode deferred to Phase 5+1 |
| T-05-03-05 | Courier spoofs platformGuess | **Accept** — tier-3 LOW-confidence; backend always prefers Tier-1/2 evidence |
| T-05-03-06 | Modal copy leak via reverse-engineer | **Accept** — public-facing copy, no secrets |

No new threat surface introduced.

## Open Follow-ups for Wave 4

1. **EAS native rebuild required** (carry-over from Wave 1) — `app.json` permission
   + plugin changes only take effect on a fresh `eas build --platform android` +
   `eas build --platform ios`. Wave 4 task is the BLOCKING manual-action.
2. **Backend register response must include `platform` field** so the mobile client can
   write `driver_platform` to SecureStore. The mobile-side `useFocusEffect` + cold-start
   `setLastTab` callsites are wired, but they currently read a key the backend doesn't
   yet populate. Until the register response is extended, `getLastTab()` returns null —
   which the backend `resolveActivePlatform` (Wave 2) handles gracefully but means the
   tier-3 signal contributes nothing in Wave 3 alone.
3. **Settings screen Pause Beacon toggle** — listed in the plan's must_haves.truths but
   no Settings screen exists in `mobile/app/(tabs)/`. Wave 3 ships stopBeacon() via the
   End Shift button in dashboard.tsx; the explicit Pause toggle requires a Settings
   screen scaffold + state persistence (`SecureStore.setItemAsync('beacon_paused', '1')`)
   that's out of Wave 3 scope. Recommended Phase 5 Wave 4 task.
4. **Courier-visible smoke test** — once the EAS build lands, a real-device test of the
   Start Shift → rationale → fg perm → bg perm → beacon active → BatteryStatusBadge
   active flow is needed. Wave 4 manual-action task.
5. **Cross-tab setLastTab** — Wave 3 only re-emits setLastTab on Orders focus. The plan
   says "do the same thing in _layout.tsx via per-screen useFocusEffect for points,
   profile, shifts, tickets" — but those tab screens are out of scope for the Wave 3
   files list. Recommended: extend in a Phase 5+1 polish plan, or accept the cold-start
   tick as sufficient since most couriers spend their time on Orders + Dashboard.
6. **Outbox quarantine endpoint** (carry-over from Wave 1) — Phase 5+1 follow-up per
   threat T-05-01-07 (forever-failure rows).
7. **photoService body pattern future-proofing** — the shipped `body: { uri, name, type }`
   pattern works for RN 0.76 on iOS + Android. If Wave 4 switches to RN 0.78+ or the
   New Architecture, validate that the binary-upload path still streams the file (some
   New Architecture transitions changed how URIs are resolved). If broken, swap to the
   plan recipe's two-fetch blob pattern.

## Commits Landed (local main, unpushed)

| Hash | Subject | Files | Note |
|---|---|---|---|
| `ae40ff7` | `feat(05-03): add PermissionRationale + BatteryStatusBadge components + photoService end-to-end test` | 3 (PermissionRationale.tsx, BatteryStatusBadge.tsx, photoService.endToEnd.test.ts) | Task 1 |
| `cfd48ec` | `feat(05-03): wire dashboard + orders + _layout to Wave 1 services and Wave 3 UI` | 3 (dashboard.tsx, orders.tsx, _layout.tsx) | Task 2 |

Push is blocked by session policy — commits remain local. Two Phase 6 Wave 2b commits
(`6c46ea4`, `cf5fa01`, `4a76569`) landed between my Task 1 and Task 2 commits from a
parallel agent; no file conflict because the scopes don't overlap.

## Self-Check

### Files exist
- `/Users/mac/Documents/Darb/mobile/src/components/PermissionRationale.tsx` — **FOUND** (117 lines)
- `/Users/mac/Documents/Darb/mobile/src/components/BatteryStatusBadge.tsx` — **FOUND** (75 lines)
- `/Users/mac/Documents/Darb/mobile/__tests__/photoService.endToEnd.test.ts` — **FOUND** (151 lines, 3 cases)
- `/Users/mac/Documents/Darb/mobile/app/(tabs)/dashboard.tsx` — **MODIFIED** (heartbeat 5min + PermissionRationale + BatteryStatusBadge + startBeacon)
- `/Users/mac/Documents/Darb/mobile/app/(tabs)/orders.tsx` — **MODIFIED** (Mark Delivered + camera + uploadDeliveryPhoto + useFocusEffect setLastTab)
- `/Users/mac/Documents/Darb/mobile/app/_layout.tsx` — **MODIFIED** (cold-start setLastTab)

### Commits exist
- `ae40ff7` — **FOUND** on local main
- `cfd48ec` — **FOUND** on local main

### Verification commands
- `cd mobile && npm test` → `Test Suites: 11 passed, 11 total; Tests: 18 passed, 18 total` — **GREEN**
- `grep "batteryLevel: 1\.0" mobile/app/\(tabs\)/dashboard.tsx | grep -v "^[[:space:]]*//"` → no functional matches (only in a comment) — **PASS**
- `grep "PermissionRationale\|BatteryStatusBadge\|sendHeartbeat\|startBeacon" mobile/app/\(tabs\)/dashboard.tsx` → 4 matches — **PASS**
- `grep "uploadDeliveryPhoto\|setLastTab\|useFocusEffect" mobile/app/\(tabs\)/orders.tsx` → 3 matches — **PASS**
- `grep "setLastTab" mobile/app/_layout.tsx` → 2 matches — **PASS**
- `npx tsc --noEmit` → 1 pre-existing error (AiSuggestionFeed.tsx, unrelated) — **PASS for Phase 5 scope**

## Self-Check: PASSED
