/**
 * driverStore.ts — single client-side source of truth for the delivery loop.
 *
 * Design rules (plan §Slice C):
 *   - The SERVER is the source of truth. `hydrate(serverState)` is called from
 *     boot, the 4s/12s offer-channel poll, AppState → active, after every
 *     event-outbox flush, and after any 409. Optimistic local advances are
 *     preserved when they are AHEAD of the server (pending outbox events);
 *     everything else adopts the server value.
 *   - Availability changes are optimistic with rollback: flip locally, POST,
 *     roll back + surface the reason on failure, and re-hydrate after a 409.
 *   - Only `availability` + the active order id are persisted (AsyncStorage
 *     partialize) — enough to restore the right screen skeleton on relaunch
 *     while /state loads. Everything else is server-fed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getState as apiGetState,
  postAvailability,
  isApiError,
  type AgentActiveOrder,
  type AgentOfferSummary,
  type AgentStateResponse,
  type AgentWalletSummary,
  type Availability,
  type OrderStage,
} from "../api/client";
import { computeClockSkewMs } from "../utils/countdown";

/**
 * Four steps, not five (client request, 2026-08-01).
 *
 * "Order picked up" and "Heading to customer" described one state and the
 * client asked for one of them to go. PICKED_UP is the one that had to stay:
 * it is the milestone the server runs the real FSM transition on
 * (ASSIGNED -> PICKED_UP in routes/agentDelivery.ts), so a driver who never
 * sends it leaves the order stuck in ASSIGNED and the POD flow refuses.
 * HEADING_TO_DROPOFF was only ever a phase-rank bump, and the server already
 * accepts ARRIVED_AT_DROPOFF straight after PICKED_UP.
 */
export const STAGE_ORDER: OrderStage[] = [
  "HEADING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "ARRIVED_AT_DROPOFF",
];

/**
 * A stage this build no longer has, mapped to the one that replaced it.
 *
 * HEADING_TO_DROPOFF left STAGE_ORDER, but a driver who was mid-delivery when
 * the app updated still has it in their persisted store, and the server may
 * echo it back. Without this it resolves to index -1, which is BELOW every real
 * stage, so the monotonic guard in advanceOrder stops guarding: any earlier
 * stage would look like progress and the order would visibly walk backwards.
 */
const LEGACY_STAGE_ALIAS: Record<string, OrderStage> = {
  HEADING_TO_DROPOFF: "PICKED_UP",
};

export function canonicalStage(stage: OrderStage | null | undefined): OrderStage | null {
  if (!stage) return null;
  return LEGACY_STAGE_ALIAS[stage] ?? stage;
}

export function stageIndex(stage: OrderStage | null | undefined): number {
  const canonical = canonicalStage(stage);
  if (!canonical) return -1;
  return STAGE_ORDER.indexOf(canonical);
}

export function nextStage(stage: OrderStage): OrderStage | null {
  const i = stageIndex(stage);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

export interface ActiveOrder extends AgentActiveOrder {
  stage: OrderStage;
}

export interface Lockout {
  active: boolean;
  reason: string | null;
}

function normalizeLockout(raw: AgentStateResponse["lockout"], wallet?: AgentWalletSummary | null): Lockout {
  if (typeof raw === "boolean") return { active: raw, reason: raw ? "CASH_CEILING_LOCKOUT" : null };
  if (raw && typeof raw === "object") return { active: !!raw.active, reason: raw.reason ?? null };
  if (wallet?.blocked) return { active: true, reason: "CASH_CEILING_LOCKOUT" };
  return { active: false, reason: null };
}

/** Derive a client stage from a server order (server `stage` wins; else map coarse status). */
function serverStage(order: AgentActiveOrder): OrderStage {
  const canonical = canonicalStage(order.stage);
  if (canonical && STAGE_ORDER.includes(canonical)) return canonical;
  const status = (order.status || "").toUpperCase();
  if (status === "PICKED_UP") return "PICKED_UP";
  return "HEADING_TO_PICKUP";
}

export interface DriverStoreState {
  hydrated: boolean; // at least one successful /state hydrate this session
  online: boolean; // last network attempt succeeded (connectivity heuristic)
  driver: { id: string; name?: string; phone?: string | null } | null;
  availability: Availability;
  availabilitySync: "idle" | "pending" | "error";
  lastAvailabilityError: string | null;
  lockout: Lockout;
  clockSkewMs: number;
  activeOffer: AgentOfferSummary | null;
  activeOrder: ActiveOrder | null;
  wallet: AgentWalletSummary | null;
  pendingEventCount: number;
  supervisorPhone: string | null;
  /** Persisted skeleton for relaunch routing (id only — data comes from /state). */
  persistedActiveOrderId: string | null;

  /** Offer ids resolved locally (accept/reject/expire) — guards against a
   *  stale poll response re-presenting the same offer. Capped, not persisted. */
  resolvedOfferIds: string[];

  hydrate: (server: AgentStateResponse) => void;
  markOffline: () => void;
  setAvailability: (next: Availability) => Promise<{ ok: boolean; reason?: string }>;
  offerReceived: (offer: AgentOfferSummary) => void;
  offerResolved: (offerId: string) => void;
  adoptOrder: (order: AgentActiveOrder, serverTime?: string) => void;
  advanceOrder: (stage: OrderStage) => void;
  completeOrder: () => void;
  setWallet: (wallet: AgentWalletSummary | null | undefined) => void;
  setPendingEventCount: (n: number) => void;
  reset: () => void;
}

const initialState = {
  hydrated: false,
  online: true,
  driver: null,
  availability: "OFFLINE" as Availability,
  availabilitySync: "idle" as const,
  lastAvailabilityError: null,
  lockout: { active: false, reason: null } as Lockout,
  clockSkewMs: 0,
  activeOffer: null,
  activeOrder: null,
  wallet: null,
  pendingEventCount: 0,
  supervisorPhone: null,
  persistedActiveOrderId: null,
  resolvedOfferIds: [] as string[],
};

export const useDriverStore = create<DriverStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      hydrate: (server) => {
        if (!server || typeof server !== "object") return;
        const s = get();

        const clockSkewMs = server.serverTime
          ? computeClockSkewMs(server.serverTime)
          : s.clockSkewMs;

        // Availability: server is truth unless a local flip is still in flight.
        const availability =
          s.availabilitySync === "pending" ? s.availability : (server.availability ?? s.availability);

        // Active order reconcile: adopt server, but never regress an
        // optimistically-advanced stage (its outbox event may not have landed).
        let activeOrder: ActiveOrder | null = null;
        if (server.activeOrder) {
          const incomingStage = serverStage(server.activeOrder);
          if (s.activeOrder && s.activeOrder.id === server.activeOrder.id) {
            const keepLocal = stageIndex(s.activeOrder.stage) > stageIndex(incomingStage);
            activeOrder = {
              ...s.activeOrder,
              ...server.activeOrder,
              stage: keepLocal ? s.activeOrder.stage : incomingStage,
            };
          } else {
            activeOrder = { ...server.activeOrder, stage: incomingStage };
          }
        } else if (s.activeOrder && s.pendingEventCount > 0) {
          // Unsynced local events still reference this order — keep it until
          // the outbox drains (a 409 there re-hydrates and clears properly).
          activeOrder = s.activeOrder;
        }

        // Offer: an active order always supersedes an offer, and offers we
        // already resolved locally (reject/expire in flight) never come back.
        // Preserve object identity when the same offer id repeats so countdown
        // renders stay smooth.
        let activeOffer: AgentOfferSummary | null = null;
        if (!activeOrder && server.activeOffer && !s.resolvedOfferIds.includes(server.activeOffer.id)) {
          activeOffer =
            s.activeOffer && s.activeOffer.id === server.activeOffer.id
              ? s.activeOffer
              : server.activeOffer;
        }

        const wallet = server.wallet ?? s.wallet;

        set({
          hydrated: true,
          online: true,
          clockSkewMs,
          driver: server.driver ? { ...server.driver } : s.driver,
          availability,
          lockout: normalizeLockout(server.lockout, wallet),
          activeOffer,
          activeOrder,
          wallet,
          supervisorPhone: server.supervisorPhone ?? s.supervisorPhone,
          persistedActiveOrderId: activeOrder?.id ?? null,
        });
      },

      markOffline: () => set({ online: false }),

      setAvailability: async (next) => {
        const prev = get().availability;
        if (prev === next) return { ok: true };
        set({ availability: next, availabilitySync: "pending", lastAvailabilityError: null });
        try {
          await postAvailability(next);
          set({ availabilitySync: "idle", online: true });
          return { ok: true };
        } catch (e: any) {
          const reason = isApiError(e) ? e.code || e.message : "NETWORK_ERROR";
          set({ availability: prev, availabilitySync: "error", lastAvailabilityError: reason });
          if (isApiError(e, 409)) {
            if (e.code === "CASH_CEILING_LOCKOUT") {
              set({ lockout: { active: true, reason: e.code } });
            }
            // Server is truth after any 409 — best-effort re-hydrate.
            try {
              get().hydrate(await apiGetState());
            } catch {
              /* swallow — next poll reconciles */
            }
          } else if (!isApiError(e)) {
            set({ online: false });
          }
          return { ok: false, reason };
        }
      },

      offerReceived: (offer) => {
        const s = get();
        if (s.activeOrder) return; // busy — offer is stale
        if (s.resolvedOfferIds.includes(offer.id)) return; // already handled
        if (s.activeOffer && s.activeOffer.id === offer.id) return; // idempotent
        set({ activeOffer: offer });
      },

      offerResolved: (offerId) => {
        const s = get();
        const resolvedOfferIds = [...s.resolvedOfferIds, offerId].slice(-5);
        if (s.activeOffer && s.activeOffer.id !== offerId) {
          set({ resolvedOfferIds });
          return;
        }
        set({ activeOffer: null, resolvedOfferIds });
      },

      adoptOrder: (order, serverTime) => {
        set({
          activeOffer: null,
          activeOrder: { ...order, stage: serverStage(order) },
          availability: "BUSY",
          persistedActiveOrderId: order.id,
          ...(serverTime ? { clockSkewMs: computeClockSkewMs(serverTime) } : {}),
        });
      },

      advanceOrder: (stage) => {
        const s = get();
        if (!s.activeOrder) return;
        if (stageIndex(stage) <= stageIndex(s.activeOrder.stage)) return; // never regress
        set({ activeOrder: { ...s.activeOrder, stage } });
      },

      completeOrder: () => {
        set({
          activeOrder: null,
          activeOffer: null,
          availability: "ONLINE",
          persistedActiveOrderId: null,
        });
      },

      setWallet: (wallet) => {
        if (!wallet) return;
        set((s) => ({
          wallet,
          lockout: wallet.blocked
            ? { active: true, reason: "CASH_CEILING_LOCKOUT" }
            : s.lockout,
        }));
      },

      setPendingEventCount: (n) => set({ pendingEventCount: Math.max(0, n) }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: "darb-driver-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        availability: s.availability,
        persistedActiveOrderId: s.persistedActiveOrderId,
      }),
    },
  ),
);
