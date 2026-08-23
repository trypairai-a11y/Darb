"use client";
// Revision 11 (#7) — the tabs the server has actually refused this login.
//
// The rail and the route fence both read `portalTabs` off /api/vendor/me, which
// is the same list the server gates every endpoint on, so in principle they
// cannot disagree. In practice they did: the client sent a shop login sitting on
// Grow with all six rail entries drawn and the panel underneath answering
// "Request failed with status code 403". Any of a /me answer cached from before
// an owner narrowed somebody, a client build older than the server, or a token
// minted under a different role puts the rail one answer behind — and the rail
// being one answer behind is exactly what hands a user a tab that cannot open.
//
// So the refusal itself becomes the evidence. The tab gate answers with
// `code: "TAB_NOT_GRANTED"` and the tab it refused, so this never has to infer
// anything from a URL, and never confuses that refusal with the role-based 403
// beside it (a tracker denied the New order endpoint has not lost the Orders
// tab). Whatever the client believed, the rail locks that one entry and the
// screen says who can undo it, instead of a Try again button that never can.
//
// Deliberately session-scoped and in memory. It only ever ADDS a restriction the
// server just enforced, so the worst case if it is ever wrong is a locked entry
// that a reload clears — never access somebody should not have had.
import { useSyncExternalStore } from "react";
import { VENDOR_TAB_ORDER } from "./vendorTabs";
import type { VendorTab } from "@/types/darb";

const EMPTY: readonly VendorTab[] = Object.freeze([]);

// Arrays rather than Sets: this project compiles down to a target where
// iterating a Set needs a compiler flag, and these lists are at most six long.
const denied: VendorTab[] = [];
let snapshot: readonly VendorTab[] = EMPTY;
let listeners: Array<() => void> = [];

/** The shape the tab gate answers a refusal with. */
interface ForbiddenBody {
  code?: string;
  tab?: string;
}

function isVendorTab(value: unknown): value is VendorTab {
  return typeof value === "string" && (VENDOR_TAB_ORDER as string[]).indexOf(value) !== -1;
}

/**
 * Record a refusal, when it was the tab gate that made it.
 *
 * Called from the axios response interceptor, so every screen in the portal is
 * covered without each one having to remember to report its own 403. Anything
 * that is not the tab gate is ignored: a permission error about one button says
 * nothing about the screen it sits on.
 */
export function noteVendorForbidden(body: unknown): void {
  const data = body as ForbiddenBody | undefined;
  if (!data || data.code !== "TAB_NOT_GRANTED") return;
  const tab = data.tab;
  if (!isVendorTab(tab) || denied.indexOf(tab) !== -1) return;
  denied.push(tab);
  // A fresh array each time it changes: useSyncExternalStore compares snapshots
  // by identity, and a mutated one would look unchanged forever.
  snapshot = Object.freeze(denied.slice());
  listeners.forEach((listener) => listener());
}

/** Forget everything. Called on sign-out, so the next login starts clean. */
export function resetVendorAccess(): void {
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
export function useDeniedVendorTabs(): readonly VendorTab[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
