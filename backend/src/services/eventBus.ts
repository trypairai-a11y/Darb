import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * Lightweight event bus backed by Redis Pub/Sub. When Redis is unavailable
 * it falls back to an in-process EventEmitter so SSE still works in dev.
 *
 * Channel naming: `events:{tenantId}` — each tenant gets its own channel so
 * subscribers only see their own data (enforced server-side, not client-side).
 */

export type DarbEventType =
  | "alert"
  | "violation"
  | "notification"
  | "driver_update"
  | "score_update"
  // v2 agent runtime events:
  | "appeal_submitted"
  | "cash_record_upserted"
  | "agent_action_pending"
  | "agent_action_resolved"
  | "briefing_published"
  // Legacy live-floor event names (Phase 7 REQ-floor-live-map) — published by
  // the agent location ingest + consumed by the floor tests. The Darb 2.0
  // union is a SUPERSET of these; do not remove.
  | "gps_point"
  | "online_session_update"
  // Darb 2.0 delivery fulfillment events (§A7):
  | "order.created"
  | "order.rejected"
  | "order.assigned"
  | "order.picked_up"
  | "order.delivered"
  | "order.failed"
  | "order.cancelled"
  | "order.dispatch_exhausted"
  | "offer.sent"
  | "offer.accepted"
  | "offer.declined"
  | "offer.expired"
  | "driver.location"
  | "driver.online"
  | "driver.offline"
  | "sos.raised"
  | "incident.updated"
  | "remittance.recorded"
  | "wallet.reconciliation_failed";

export interface DarbEvent {
  type: DarbEventType;
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

type Listener = (event: DarbEvent) => void;

// In-process fallback
const localListeners = new Map<string, Set<Listener>>();

let pub: Redis | null = null;
let sub: Redis | null = null;

function hasRedis(): boolean {
  return !!env.REDIS_URL && env.REDIS_URL !== "redis://localhost:6379";
}

function initRedis() {
  if (!hasRedis() || pub) return;
  try {
    pub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

    sub.on("message", (channel, message) => {
      try {
        const event = JSON.parse(message) as DarbEvent;
        const listeners = localListeners.get(channel);
        listeners?.forEach((fn) => fn(event));
      } catch {
        // malformed message — skip
      }
    });

    pub.on("error", (err) => logger.error({ err }, "eventBus pub error"));
    sub.on("error", (err) => logger.error({ err }, "eventBus sub error"));
    logger.info("eventBus: Redis pub/sub initialised");
  } catch (e) {
    logger.warn({ err: e }, "eventBus: Redis unavailable, using in-process fallback");
  }
}

function channelKey(tenantId: string) {
  return `events:${tenantId}`;
}

/**
 * Publish an event for a tenant. Broadcasts to all SSE subscribers.
 */
export async function publishEvent(event: DarbEvent): Promise<void> {
  initRedis();
  const channel = channelKey(event.tenantId);
  const json = JSON.stringify(event);

  if (pub) {
    await pub.publish(channel, json).catch((e) =>
      logger.warn({ err: e }, "eventBus publish failed")
    );
  }

  // Also fire local listeners (covers same-process subscribers + fallback mode)
  const listeners = localListeners.get(channel);
  listeners?.forEach((fn) => {
    try { fn(event); } catch { /* swallow per-listener errors */ }
  });
}

/**
 * Subscribe to events for a tenant. Returns an unsubscribe function.
 */
export function subscribe(tenantId: string, listener: Listener): () => void {
  initRedis();
  const channel = channelKey(tenantId);

  if (!localListeners.has(channel)) {
    localListeners.set(channel, new Set());
    // Subscribe on Redis only once per channel
    sub?.subscribe(channel).catch((e) =>
      logger.warn({ err: e }, "eventBus subscribe failed")
    );
  }

  localListeners.get(channel)!.add(listener);

  return () => {
    const set = localListeners.get(channel);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        localListeners.delete(channel);
        sub?.unsubscribe(channel).catch(() => {});
      }
    }
  };
}
