// Darb 2.0 — module-level driver-position store for the live map.
// SSE driver.location events land here (never in React state per event);
// updates are batched and flushed at most once per second, and components
// subscribe through useSyncExternalStore. Staleness (now - at > 60s) is
// evaluated at flush time so marker styling ages out without extra renders.
"use client";
import { useSyncExternalStore } from "react";
import type { DriverPosition } from "@/types/darb";

const STALE_AFTER_MS = 60_000;
const FLUSH_MIN_INTERVAL_MS = 1_000;
/** Re-evaluate staleness periodically even when no events arrive. */
const IDLE_REFLUSH_MS = 10_000;

const live = new Map<string, DriverPosition>();
const pending = new Map<string, DriverPosition>();
const listeners = new Set<() => void>();

let version = 0;
let snapshot: DriverPosition[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setInterval> | null = null;
let lastFlushAt = 0;

function isStale(p: DriverPosition, now: number): boolean {
  const at = new Date(p.at).getTime();
  return !Number.isFinite(at) || now - at > STALE_AFTER_MS;
}

function flush() {
  flushTimer = null;
  lastFlushAt = Date.now();
  pending.forEach((p, id) => {
    // Merge over the previous record so bootstrap-only fields (name, phone,
    // vehicle) survive lean location events.
    const prev = live.get(id);
    live.set(id, prev ? { ...prev, ...p } : p);
  });
  pending.clear();

  const now = Date.now();
  const next: DriverPosition[] = [];
  live.forEach((p, id) => {
    const stale = isStale(p, now);
    const record = p.stale === stale ? p : { ...p, stale };
    if (record !== p) live.set(id, record);
    next.push(record);
  });
  snapshot = next;
  version++;
  listeners.forEach((l) => l());
}

function scheduleFlush() {
  if (flushTimer) return;
  const wait = Math.max(0, FLUSH_MIN_INTERVAL_MS - (Date.now() - lastFlushAt));
  flushTimer = setTimeout(flush, wait);
}

/** Queue a position update (e.g. from a driver.location SSE event). */
export function upsertPosition(position: DriverPosition) {
  pending.set(position.driverId, position);
  scheduleFlush();
}

/** Replace the store from a snapshot (GET /api/dispatch/positions). */
export function bootstrapPositions(positions: DriverPosition[]) {
  live.clear();
  pending.clear();
  positions.forEach((p) => live.set(p.driverId, p));
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

export function clearPositions() {
  live.clear();
  pending.clear();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

export function getPositionsSnapshot(): DriverPosition[] {
  return snapshot;
}

export function getStoreVersion(): number {
  return version;
}

export function subscribePositions(listener: () => void): () => void {
  listeners.add(listener);
  if (!idleTimer) {
    idleTimer = setInterval(() => {
      if (live.size > 0) scheduleFlush();
    }, IDLE_REFLUSH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  };
}

/** React subscription — returns the latest flushed snapshot array. */
export function useDriverPositions(): DriverPosition[] {
  return useSyncExternalStore(subscribePositions, getPositionsSnapshot, getPositionsSnapshot);
}
