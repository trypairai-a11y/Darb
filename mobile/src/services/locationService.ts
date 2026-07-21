/**
 * Background GPS beacon service.
 *
 * Wave 1 rewrite — replaces the AsyncStorage-buffered legacy implementation with:
 *   - expo-sqlite outbox (durable, idempotency-keyed)
 *   - TaskManager.defineTask at MODULE TOP LEVEL (mandatory — see comment below)
 *   - iOS background settings: activityType=AutomotiveNavigation,
 *     pausesUpdatesAutomatically=false, showsBackgroundLocationIndicator=true
 *     (without these the OS kills our location stream after ~30 min)
 *   - Two-step permission flow: WhenInUse first, then upgrade to Always
 *     (per Apple HIG + Android best practice; asking bg-only is rejected by OS)
 *
 * Why defineTask at module top-level?
 *   When the OS wakes the process to deliver a background location event, it instantiates
 *   the JS VM and resolves the task by name. If defineTask is inside a React useEffect or
 *   any other lazy callback, the lookup fails and the OS records the task as "missing" —
 *   on Android 14 this is grounds for the OS to permanently revoke our background-location
 *   token. Module-top-level guarantees the registration happens during the import phase
 *   that runs before any React tree is mounted.
 */

import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { enqueueGpsPoint, flushPendingPoints } from "./outbox";
import { getLastTab } from "./platformGuess";

const LOCATION_TASK = "darb-background-location";
const isWeb = Platform.OS === "web";

// MUST be at module top-level — see header doc. Anti-pattern alarm: do not move this
// inside useEffect, useLayoutEffect, or any conditional branch. The OS rehydrates the
// task by name; module-load is the only safe time to register.
// Web: TaskManager has no browser implementation — skipped entirely; the web
// beacon lives in webLocationService.ts (navigator.geolocation.watchPosition).
if (!isWeb) TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) return;
  if (!data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  for (const loc of locations) {
    await enqueueGpsPoint({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? 0,
      speed: loc.coords.speed ?? null,
      capturedAt: new Date(loc.timestamp).toISOString(),
      platformGuess: getLastTab(),
    });
  }

  // Best-effort flush — failures push attempts++ on the rows we just enqueued, the
  // give-up filter prevents forever-retry. We swallow errors here so a transient
  // network blip doesn't bubble up into the TaskManager runtime (which would mark
  // the task as failing and back off scheduling — see RESEARCH.md Pitfall 6).
  await flushPendingPoints().catch(() => {});

  // Darb 2.0 layer C — while the courier is ONLINE/BUSY, piggyback a best-effort
  // state hydrate + business-event flush on the ~30s background GPS wake. This is
  // the last-resort offer/status channel when the app is backgrounded and push is
  // unavailable (Expo Go). Dynamic imports keep the module graph of the headless
  // task context lean, and every failure is swallowed for the same Pitfall-6 reason.
  try {
    const { useDriverStore } = await import("../store/driverStore");
    if (useDriverStore.getState().availability !== "OFFLINE") {
      const { hydrateNow } = await import("./offerChannel");
      await hydrateNow();
      const { flushEventOutbox } = await import("./eventOutbox");
      await flushEventOutbox();
    }
  } catch {
    /* never let the beacon task fail on delivery-loop work */
  }
});

export type StartBeaconResult =
  | { ok: true }
  | { ok: false; reason: "foreground_denied" | "background_denied" | "unknown" };

export async function startBeacon(): Promise<StartBeaconResult> {
  // Web: no TaskManager, no background permission — delegate to the
  // watchPosition-based beacon which feeds the same outbox/POST pipeline.
  if (isWeb) {
    const { startWebBeacon } = await import("./webLocationService");
    return startWebBeacon();
  }

  // Step 1: ask for WhenInUse first. iOS requires this — asking for Always without
  // a prior WhenInUse grant on iOS 14+ silently denies. Android allows the upgrade
  // either way but matching iOS keeps the prompt sequence identical cross-platform.
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { ok: false, reason: "foreground_denied" };
  }

  // Step 2: upgrade to Always (background). On Android 14+ this surfaces the
  // "Allow all the time" / "Only while using the app" dialog. If denied here,
  // the beacon cannot run during shifts (background updates are required to
  // keep tracking when the screen is off / app is backgrounded).
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return { ok: false, reason: "background_denied" };
  }

  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (running) return { ok: true };

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 30_000,
    distanceInterval: 25,
    deferredUpdatesInterval: 60_000,
    deferredUpdatesDistance: 100,
    activityType: Location.LocationActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Darb is tracking your shift",
      notificationBody: "Active until you tap End Shift",
      notificationColor: "#F97316",
      killServiceOnDestroy: false,
    },
  });

  return { ok: true };
}

export async function stopBeacon(): Promise<void> {
  if (isWeb) {
    const { stopWebBeacon } = await import("./webLocationService");
    return stopWebBeacon();
  }
  // Drain the outbox before stopping — last-mile flush so we don't leave 1-2 stale
  // points sitting in SQLite for the next shift. Best-effort: if the network is down
  // the rows stay queued and the next startBeacon picks them up.
  await flushPendingPoints().catch(() => {});
  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (running) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
}
