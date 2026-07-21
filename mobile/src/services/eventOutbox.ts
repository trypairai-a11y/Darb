/**
 * eventOutbox.ts — durable business-event outbox (ORDER_STATUS / POD / INCIDENT).
 *
 * Second table in the same SQLite DB as the GPS outbox (`outbox.ts`), sharing
 * its semantics — UNIQUE idempotencyKey with INSERT OR IGNORE, FIFO flush,
 * reentrancy guard — with ONE deliberate difference: **no attempts give-up**.
 * A GPS point is cheap telemetry; losing one is accepted. A status milestone,
 * a proof-of-delivery, or an SOS is business-critical: rows retry forever
 * until the server answers 2xx (delete) or 409 (delete + re-hydrate — the
 * server already knows better).
 *
 * FIFO is strict: a network failure on the head row STOPS the flush so a
 * later event can never land before an earlier one (PICKED_UP before
 * ARRIVED_AT_PICKUP would 409 spuriously).
 *
 * POD rows queued offline carry a local photo URI; the flush runs the full
 * presign → PUT → POST /pod pipeline. Once the upload succeeds the row is
 * rewritten with the storage key so a later retry never re-uploads.
 */

import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { WebQueue } from "./webQueueStore";
import {
  isApiError,
  postIncident,
  postOrderStatus,
  postPod,
  type IncidentCategory,
  type OrderStage,
} from "../api/client";
import { uploadDeliveryPhoto } from "./photoService";
// Static import is safe: offerChannel reaches back to this module only via a
// lazy dynamic import inside its poll tick, so there is no require cycle.
import { hydrateNow } from "./offerChannel";
import { useDriverStore } from "../store/driverStore";

export type EventKind = "ORDER_STATUS" | "POD" | "INCIDENT";

export interface OrderStatusEventPayload {
  orderId: string;
  status: OrderStage;
  occurredAt: string;
  lat?: number;
  lng?: number;
}

export interface PodEventPayload {
  orderId: string;
  method: "PHOTO" | "PIN";
  pin?: string;
  photoUri?: string; // local file — flush presigns + PUTs, then swaps for photoKey
  photoKey?: string;
  codCollectedKwd?: number;
  lat: number;
  lng: number;
}

export interface IncidentEventPayload {
  category: IncidentCategory;
  description?: string;
  lat?: number;
  lng?: number;
  orderId?: string;
  photoUris?: string[];
}

type EventPayload = OrderStatusEventPayload | PodEventPayload | IncidentEventPayload;

interface EventRow {
  id: number;
  idempotencyKey: string;
  kind: EventKind;
  payload: string;
  attempts: number;
  createdAt: number;
}

// Web fallback: same public API, storage swapped for a localStorage-persisted
// queue (expo-sqlite is unavailable in this web setup). Business events keep
// their no-give-up FIFO semantics; persistence is best effort across reloads.
const isWeb = Platform.OS === "web";
let _webQueue: WebQueue | null = null;
function wq(): WebQueue {
  if (!_webQueue) _webQueue = new WebQueue("darb-outbox-events");
  return _webQueue;
}

let _db: SQLite.SQLiteDatabase | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  // Same DB file as the GPS outbox — one SQLite handle budget, two tables.
  _db = await SQLite.openDatabaseAsync("darb-outbox.db");
  await _db.execAsync(
    `CREATE TABLE IF NOT EXISTS event_outbox (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       idempotencyKey TEXT NOT NULL UNIQUE,
       kind TEXT NOT NULL,
       payload TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       createdAt INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
     );
     CREATE INDEX IF NOT EXISTS idx_event_outbox_id ON event_outbox(id);`,
  );
  return _db;
}

async function refreshPendingCount(): Promise<number> {
  let count: number;
  if (isWeb) {
    count = wq().count();
  } else {
    const d = await db();
    const r = await d.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM event_outbox`,
    );
    count = r?.count ?? 0;
  }
  useDriverStore.getState().setPendingEventCount(count);
  return count;
}

export async function enqueueEvent(
  kind: EventKind,
  idempotencyKey: string,
  payload: EventPayload,
): Promise<void> {
  if (isWeb) {
    wq().insertIgnore(idempotencyKey, JSON.stringify(payload), kind);
  } else {
    const d = await db();
    await d.runAsync(
      `INSERT OR IGNORE INTO event_outbox (idempotencyKey, kind, payload) VALUES (?, ?, ?)`,
      idempotencyKey,
      kind,
      JSON.stringify(payload),
    );
  }
  await refreshPendingCount();
}

/** Convenience: milestone events use a deterministic `${orderId}:${stage}` key
 *  — tapping the button twice (or replaying the row) collapses server-side. */
export async function enqueueOrderStatus(
  orderId: string,
  status: OrderStage,
  coords?: { lat: number; lng: number } | null,
): Promise<void> {
  await enqueueEvent("ORDER_STATUS", `${orderId}:${status}`, {
    orderId,
    status,
    occurredAt: new Date().toISOString(),
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
  });
}

async function deliverRow(row: EventRow): Promise<void> {
  const payload = JSON.parse(row.payload) as EventPayload;

  if (row.kind === "ORDER_STATUS") {
    const p = payload as OrderStatusEventPayload;
    await postOrderStatus(p.orderId, {
      status: p.status,
      occurredAt: p.occurredAt,
      idempotencyKey: row.idempotencyKey,
      lat: p.lat,
      lng: p.lng,
    });
    return;
  }

  if (row.kind === "POD") {
    const p = payload as PodEventPayload;
    let photoKey = p.photoKey;
    if (!photoKey && p.photoUri) {
      const uploaded = await uploadDeliveryPhoto({
        orderId: p.orderId,
        uri: p.photoUri,
        latitude: p.lat,
        longitude: p.lng,
      });
      photoKey = uploaded.key;
      // Persist the key so retries never re-upload the photo.
      if (isWeb) {
        wq().setPayload(row.id, JSON.stringify({ ...p, photoKey }));
      } else {
        const d = await db();
        await d.runAsync(
          `UPDATE event_outbox SET payload = ? WHERE id = ?`,
          JSON.stringify({ ...p, photoKey }),
          row.id,
        );
      }
    }
    const res = await postPod(p.orderId, {
      method: p.method,
      pin: p.pin,
      photoKey,
      codCollectedKwd: p.codCollectedKwd,
      lat: p.lat,
      lng: p.lng,
      idempotencyKey: row.idempotencyKey,
    });
    const store = useDriverStore.getState();
    if (res?.wallet) store.setWallet(res.wallet);
    if (store.activeOrder && store.activeOrder.id === p.orderId) store.completeOrder();
    return;
  }

  // INCIDENT
  const p = payload as IncidentEventPayload;
  await postIncident({
    category: p.category,
    description: p.description,
    lat: p.lat,
    lng: p.lng,
    orderId: p.orderId,
    photos: (p.photoUris ?? []).map((uri) => ({ uri })),
  });
}

let flushInFlight = false;

export async function flushEventOutbox(): Promise<{ flushed: number; remaining: number }> {
  if (flushInFlight) return { flushed: 0, remaining: useDriverStore.getState().pendingEventCount };
  flushInFlight = true;
  let sawConflict = false;
  let flushed = 0;
  try {
    const d = isWeb ? null : await db();
    const rows: EventRow[] = isWeb
      ? (wq().head(20) as EventRow[])
      : await d!.getAllAsync<EventRow>(
          `SELECT id, idempotencyKey, kind, payload, attempts, createdAt
             FROM event_outbox
            ORDER BY id ASC
            LIMIT 20`,
        );

    for (const row of rows) {
      try {
        await deliverRow(row);
        if (isWeb) wq().remove([row.id]);
        else await d!.runAsync(`DELETE FROM event_outbox WHERE id = ?`, row.id);
        flushed++;
      } catch (e: any) {
        if (isApiError(e, 409)) {
          // The server's state machine already moved past this event — drop
          // the row and re-hydrate so the UI adopts the server's truth.
          if (isWeb) wq().remove([row.id]);
          else await d!.runAsync(`DELETE FROM event_outbox WHERE id = ?`, row.id);
          sawConflict = true;
          continue;
        }
        // Anything else (network, 5xx, 4xx): attempts++ for observability,
        // never give up, and STOP so FIFO order is preserved.
        if (isWeb) wq().bumpAttempts([row.id]);
        else
          await d!.runAsync(
            `UPDATE event_outbox SET attempts = attempts + 1 WHERE id = ?`,
            row.id,
          );
        break;
      }
    }

    const remaining = await refreshPendingCount();
    if (sawConflict) {
      // The server's FSM was ahead of us somewhere — adopt its truth.
      hydrateNow().catch(() => {});
    }
    return { flushed, remaining };
  } finally {
    flushInFlight = false;
  }
}

export async function countPendingEvents(): Promise<number> {
  return refreshPendingCount();
}

// ─── Test-only seams (mirrors outbox.ts) ────────────────────────────────────

export async function _resetForTests(): Promise<void> {
  if (isWeb) {
    wq().clear();
  } else {
    const d = await db();
    await d.runAsync(`DELETE FROM event_outbox`);
  }
  useDriverStore.getState().setPendingEventCount(0);
}

export async function _allRowsForTests(): Promise<EventRow[]> {
  if (isWeb) return wq().all() as EventRow[];
  const d = await db();
  return d.getAllAsync(
    `SELECT id, idempotencyKey, kind, payload, attempts, createdAt FROM event_outbox`,
  );
}
