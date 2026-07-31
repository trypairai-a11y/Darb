"use client";
// Revision 13 (#6) — the fleet tabs the server has actually refused this login.
//
// The mirror of lib/vendorAccess.ts, and its own store rather than a shared one
// because the two portals have different tab names: a list that held both would
// have to guess which portal a refusal came from, and guessing is what the
// TAB_NOT_GRANTED code exists to stop.
//
// The rail and the route fence both read `portalTabs` off /api/fleet/me, which
// is the same list the server gates every endpoint on, so in principle they
// cannot disagree. In practice a /me answer cached from before an owner
// narrowed somebody, or a client build older than the server, puts the rail one
// answer behind — and the rail being one answer behind is what hands a user a
// tab that cannot open. So the refusal itself becomes the evidence.
//
// Session-scoped and in memory. It only ever ADDS a restriction the server just
// enforced, so the worst case if it is ever wrong is a locked entry that a
// reload clears, never access somebody should not have had.
import { useSyncExternalStore } from "react";
import { FLEET_TAB_ORDER } from "./fleetTabs";
import type { FleetTab } from "@/types/darb";

const EMPTY: readonly FleetTab[] = Object.freeze([]);

const denied: FleetTab[] = [];
let snapshot: readonly FleetTab[] = EMPTY;
let listeners: Array<() => void> = [];

/** The shape the tab gate answers a refusal with. */
interface ForbiddenBody {
  code?: string;
  tab?: string;
}

function isFleetTab(value: unknown): value is FleetTab {
  return typeof value === "string" && (FLEET_TAB_ORDER as string[]).indexOf(value) !== -1;
}

/**
 * Record a refusal, when it was the tab gate that made it.
 *
 * Called from the axios response interceptor, so every screen in the portal is
 * covered without each one having to report its own 403. The role-based 403
 * beside it carries no code and is ignored here on purpose: a supervisor
 * refused the Add login button has not lost the Team tab.
 */
export function noteFleetForbidden(body: unknown): void {
  const data = body as ForbiddenBody | undefined;
  if (!data || data.code !== "TAB_NOT_GRANTED") return;
  const tab = data.tab;
  if (!isFleetTab(tab) || denied.indexOf(tab) !== -1) return;
  denied.push(tab);
  // A fresh array each time it changes: useSyncExternalStore compares snapshots
  // by identity, and a mutated one would look unchanged forever.
  snapshot = Object.freeze(denied.slice());
  listeners.forEach((listener) => listener());
}

/** Forget everything. Called on sign-out, so the next login starts clean. */
export function resetFleetAccess(): void {
  if (denied.length === 0) return;
  denied.length = 0;
  snapshot = EMPTY;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** The tabs the server has refused this session. Empty during SSR. */
export function useDeniedFleetTabs(): readonly FleetTab[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
