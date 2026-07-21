/**
 * webLocationService — browser GPS beacon (Platform.OS === "web" only).
 *
 * The native beacon (locationService.ts) uses expo-location + TaskManager for
 * background updates. None of that exists in a browser, so on web:
 *
 *   - navigator.geolocation.watchPosition(enableHighAccuracy, maximumAge 10s)
 *     runs while the driver is ONLINE/BUSY and the tab is VISIBLE.
 *   - Fixes are throttled to one post per ~25s, or sooner when the driver has
 *     moved >= 25 m (Haversine) with a 10s hard floor between posts.
 *   - Every accepted fix feeds the SAME durable outbox path the native
 *     TaskManager task uses (enqueueGpsPoint → flushPendingPoints → bulk
 *     POST /api/agent/location with idempotency keys). No parallel pipeline.
 *   - visibilitychange pauses the watch when the tab hides and resumes it when
 *     visible again. There is NO background GPS on web — the UI surfaces
 *     "keep this tab open" (WebShiftBanner) so drivers know the deal.
 *   - A driver-store subscription stops the watch the moment availability flips
 *     to OFFLINE and restores it after a reload while still ONLINE/BUSY.
 *
 * Status is observable (subscribeWebGpsStatus) so the banner can react to
 * hidden-tab / permission-denied states without polling.
 */

import { Platform } from "react-native";
import { enqueueGpsPoint, flushPendingPoints } from "./outbox";
import { getLastTab } from "./platformGuess";
import { useDriverStore } from "../store/driverStore";
import type { StartBeaconResult } from "./locationService";

export type WebGpsStatus = "idle" | "watching" | "hidden" | "denied" | "unavailable";

const MIN_POST_INTERVAL_MS = 25_000; // regular cadence
const MIN_MOVE_METERS = 25; // early post when the driver actually moved
const MIN_POST_FLOOR_MS = 10_000; // hard floor even when moving

let status: WebGpsStatus = "idle";
const listeners = new Set<(s: WebGpsStatus) => void>();

let initialized = false;
let watchId: number | null = null;
let lastPostAt = 0;
let lastLat: number | null = null;
let lastLng: number | null = null;

function setStatus(next: WebGpsStatus): void {
  if (status === next) return;
  status = next;
  for (const l of listeners) {
    try {
      l(status);
    } catch {
      /* listener errors never break the beacon */
    }
  }
}

export function getWebGpsStatus(): WebGpsStatus {
  return status;
}

export function subscribeWebGpsStatus(fn: (s: WebGpsStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function geo(): Geolocation | null {
  try {
    return typeof navigator !== "undefined" && "geolocation" in navigator
      ? navigator.geolocation
      : null;
  } catch {
    return null;
  }
}

function onPosition(pos: GeolocationPosition): void {
  const { latitude, longitude, accuracy, speed } = pos.coords;
  const now = Date.now();
  const elapsed = now - lastPostAt;
  const moved =
    lastLat == null || lastLng == null
      ? Infinity
      : haversineMeters(lastLat, lastLng, latitude, longitude);

  // Throttle: post on the ~25s cadence, or early when moved >= 25 m (with a
  // 10s floor so a moving vehicle doesn't post every watch callback).
  if (elapsed < MIN_POST_INTERVAL_MS && !(moved >= MIN_MOVE_METERS && elapsed >= MIN_POST_FLOOR_MS)) {
    return;
  }

  lastPostAt = now;
  lastLat = latitude;
  lastLng = longitude;

  void (async () => {
    try {
      await enqueueGpsPoint({
        latitude,
        longitude,
        accuracy: accuracy ?? 0,
        speed: speed ?? null,
        capturedAt: new Date(pos.timestamp || now).toISOString(),
        platformGuess: getLastTab(),
      });
      await flushPendingPoints();
    } catch {
      /* enqueue/flush are best-effort — rows stay queued for the next flush */
    }
  })();
}

function onError(err: GeolocationPositionError): void {
  // code 1 = PERMISSION_DENIED. Timeouts / position-unavailable are transient;
  // the watch keeps firing, so we leave the status alone for those.
  if (err && err.code === 1) {
    stopWatch();
    setStatus("denied");
  }
}

function startWatch(): void {
  if (watchId != null) return;
  const g = geo();
  if (!g) {
    setStatus("unavailable");
    return;
  }
  watchId = g.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 10_000,
    timeout: 30_000,
  });
  setStatus("watching");
}

function stopWatch(): void {
  if (watchId != null) {
    geo()?.clearWatch(watchId);
    watchId = null;
  }
}

function isHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  } catch {
    return false;
  }
}

/** Reconcile the watch with (availability, tab visibility, permission). */
function evaluate(): void {
  const availability = useDriverStore.getState().availability;
  const wanted = availability !== "OFFLINE";

  if (!wanted) {
    stopWatch();
    setStatus("idle");
    return;
  }
  if (status === "denied" || status === "unavailable") return; // startWebBeacon() resets
  if (isHidden()) {
    stopWatch();
    setStatus("hidden");
    // Tab going hidden is the last JS we may run for a while — try to push
    // whatever is still queued out the door.
    flushPendingPoints().catch(() => {});
    return;
  }
  startWatch();
}

/**
 * Idempotent wiring: store subscription + visibilitychange. Called from the
 * root layout on web so a page RELOAD while ONLINE resumes tracking without
 * the driver touching the availability control.
 */
export function initWebLocationService(): void {
  if (Platform.OS !== "web" || initialized) return;
  initialized = true;
  useDriverStore.subscribe((s, prev) => {
    if (s.availability !== prev.availability) evaluate();
  });
  try {
    document.addEventListener("visibilitychange", evaluate);
  } catch {
    /* no document (SSR pass) — watch starts from startWebBeacon instead */
  }
  evaluate();
}

/**
 * Web analogue of startBeacon(): triggers the browser permission prompt via a
 * one-shot getCurrentPosition, then hands off to the watch lifecycle.
 */
export async function startWebBeacon(): Promise<StartBeaconResult> {
  initWebLocationService();
  const g = geo();
  if (!g) {
    setStatus("unavailable");
    return { ok: false, reason: "unknown" };
  }
  // Clear a previous denial — the user may have re-allowed in browser settings.
  if (status === "denied" || status === "unavailable") setStatus("idle");

  return new Promise<StartBeaconResult>((resolve) => {
    g.getCurrentPosition(
      (pos) => {
        onPosition(pos); // free first fix — seed the outbox immediately
        evaluate();
        resolve({ ok: true });
      },
      (err) => {
        if (err && err.code === 1) {
          setStatus("denied");
          resolve({ ok: false, reason: "foreground_denied" });
          return;
        }
        // Timeout / unavailable: permission is granted (or undecided without a
        // denial) — start the watch anyway; it will keep trying.
        evaluate();
        resolve({ ok: true });
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
  });
}

export async function stopWebBeacon(): Promise<void> {
  stopWatch();
  setStatus("idle");
  await flushPendingPoints().catch(() => {});
}
