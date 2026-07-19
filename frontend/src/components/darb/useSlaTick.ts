// Darb 2.0 — shared 1Hz clock. One module-level interval feeds every mounted
// SlaCountdown via useSyncExternalStore, so N countdowns cost one timer and
// tick in lockstep. The interval only runs while at least one subscriber is
// mounted.
"use client";
import { useSyncExternalStore } from "react";

let now = Date.now();
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!interval) {
    interval = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot(): number {
  return now;
}

/** Returns the shared "now" (ms epoch), updated at 1Hz while mounted. */
export function useSlaTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
