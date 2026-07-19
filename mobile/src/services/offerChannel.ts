/**
 * offerChannel.ts — layered offer/state delivery channel (plan §Slice C).
 *
 * Layer A (this module): foreground polling of GET /api/agent/state.
 *   - every 4s   while availability === ONLINE and no active order (offer hunt)
 *   - every 12s  while an order is active (SLA/status refresh)
 *   - stopped    when OFFLINE, BUSY-without-order, or the app is backgrounded
 * Layer B: Expo push data messages ("darb-offers" channel) — a WAKE-UP nudge
 *   only; the listener in app/_layout.tsx calls hydrateNow(). The countdown is
 *   never rendered from push payloads.
 * Layer C: the background GPS task piggybacks a best-effort hydrateNow().
 *
 * Every successful response recomputes clockSkewMs inside store.hydrate()
 * (serverTime - Date.now()) so countdowns always run on the server's clock.
 *
 * Lifecycle is owned by app/_layout.tsx: start/stop on AppState transitions +
 * a store subscription restarts the loop when availability/order flips.
 */

import { getState } from "../api/client";
import { useDriverStore } from "../store/driverStore";

const OFFER_HUNT_MS = 4_000;
const ACTIVE_ORDER_MS = 12_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let inFlight = false;

/** One-shot fetch + hydrate. Safe to call from anywhere; swallows nothing —
 *  callers decide. Concurrent calls collapse to a single request. */
export async function hydrateNow(): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  try {
    const state = await getState();
    useDriverStore.getState().hydrate(state);
    return true;
  } catch {
    useDriverStore.getState().markOffline();
    return false;
  } finally {
    inFlight = false;
  }
}

function currentDelayMs(): number | null {
  const s = useDriverStore.getState();
  if (s.activeOrder) return ACTIVE_ORDER_MS;
  if (s.availability === "ONLINE") return OFFER_HUNT_MS;
  return null; // OFFLINE or BUSY-without-order → channel idle
}

async function tick(): Promise<void> {
  if (!running) return;
  await hydrateNow();

  // Retry pending outbox events on the poll cadence (reentrancy-guarded there).
  try {
    const s = useDriverStore.getState();
    if (s.pendingEventCount > 0) {
      const { flushEventOutbox } = await import("./eventOutbox");
      await flushEventOutbox();
    }
  } catch {
    /* best-effort */
  }

  schedule();
}

function schedule(): void {
  if (!running) return;
  if (timer) clearTimeout(timer);
  const delay = currentDelayMs();
  if (delay == null) {
    // Nothing to poll for right now. _layout's store subscription calls
    // startOfferChannel() again when availability/order state changes.
    running = false;
    timer = null;
    return;
  }
  timer = setTimeout(() => {
    void tick();
  }, delay);
}

/** Start (or re-evaluate) the poll loop. Idempotent. */
export function startOfferChannel(): void {
  if (running) return;
  if (currentDelayMs() == null) return;
  running = true;
  // First tick fires immediately so a foregrounded app feels instant.
  void tick();
}

export function stopOfferChannel(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function isOfferChannelRunning(): boolean {
  return running;
}
