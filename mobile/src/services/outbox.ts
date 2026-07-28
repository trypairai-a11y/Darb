/**
 * Durable GPS outbox backed by expo-sqlite.
 *
 * Why SQLite (not AsyncStorage)?
 *   AsyncStorage is a JSON-on-disk K/V store with NO concurrent-write safety. The TaskManager
 *   background callback runs in a separate JS context that races with foreground writes;
 *   Expo's own issue tracker has documented corruption under exactly this pattern
 *   (github.com/expo/expo#33754). SQLite with parameterised statements is the Expo-blessed
 *   way to durably queue background work.
 *
 * Schema (matches __tests__/mocks/expo-sqlite.ts seam):
 *   outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,
 *          idempotencyKey TEXT NOT NULL UNIQUE,
 *          payload TEXT NOT NULL,      -- JSON.stringify(OutboxGpsPoint)
 *          attempts INTEGER NOT NULL DEFAULT 0,
 *          createdAt INTEGER NOT NULL)
 *
 * Idempotency key format:
 *   `${capturedAt.slice(0,19)}-${lat.toFixed(5)},${lng.toFixed(5)}`
 *   → two GPS samples within the same second at the same ~1.1 m grid cell collapse to one row.
 *   `INSERT OR IGNORE` silently rejects the dupe — no exception thrown, idempotent at the
 *   storage layer regardless of how often TaskManager re-fires.
 *
 * Flush semantics:
 *   - SELECT rows WHERE attempts < 5 ORDER BY id ASC LIMIT 50 (head-of-queue, batch-of-50)
 *   - POST to /api/agent/location with deviceId + driverId + locations[] + platformGuess
 *   - On success → DELETE rows by id (the server confirmed; nothing to retry)
 *   - On failure → UPDATE attempts = attempts + 1, lastError = ?
 *   - Rows with attempts >= 5 are skipped on subsequent flushes (give-up; the Wave 4 SUMMARY
 *     documents this as accepted data loss per T-05-01-07 in the threat register).
 *
 * Reentrancy guard:
 *   `flushInFlight` prevents two concurrent flush calls. If the background task fires while
 *   a foreground flush is mid-POST, the second call no-ops with { flushed: 0 } instead of
 *   double-uploading. SQLite still serialises writes, but skipping the network round-trip
 *   saves battery and avoids 429s.
 */

import { Platform } from "react-native";
// expo-sqlite is imported for its TYPES only. A value import evaluates the
// module at load, which calls requireNativeModule("ExpoSQLite") and throws on
// web — before any Platform.OS branch below can run. That crash took the whole
// driver app to a blank white screen in a phone browser, which is the one
// place the card promises it works. The real module is required lazily inside
// db(), which is only ever reached when !isWeb.
import type * as SQLite from "expo-sqlite";
import * as SecureStore from "./deviceStorage";
import { uploadLocations } from "../api/client";
import { WebQueue } from "./webQueueStore";

// Web fallback: expo-sqlite is not available in this web setup. Same public
// API, storage swapped for a localStorage-persisted in-memory queue.
const isWeb = Platform.OS === "web";
let _webQueue: WebQueue | null = null;
function wq(): WebQueue {
  if (!_webQueue) _webQueue = new WebQueue("darb-outbox-gps");
  return _webQueue;
}

export interface OutboxGpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  capturedAt: string; // ISO datetime
  platformGuess: string | null;
}

interface OutboxRow {
  id: number;
  idempotencyKey: string;
  payload: string;
  attempts: number;
  createdAt: number;
}

let _db: SQLite.SQLiteDatabase | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  // Required here, not at module scope — see the import note above.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sqlite = require("expo-sqlite") as typeof import("expo-sqlite");
  _db = await sqlite.openDatabaseAsync("darb-outbox.db");
  await _db.execAsync(
    `CREATE TABLE IF NOT EXISTS outbox (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       idempotencyKey TEXT NOT NULL UNIQUE,
       payload TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       createdAt INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
     );
     CREATE INDEX IF NOT EXISTS idx_outbox_attempts_id ON outbox(attempts, id);`,
  );
  return _db;
}

function makeIdempotencyKey(p: OutboxGpsPoint): string {
  return `${p.capturedAt.slice(0, 19)}-${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
}

export async function enqueueGpsPoint(p: OutboxGpsPoint): Promise<void> {
  const idempotencyKey = makeIdempotencyKey(p);
  const payload = JSON.stringify(p);
  if (isWeb) {
    wq().insertIgnore(idempotencyKey, payload);
    return;
  }
  const d = await db();
  // INSERT OR IGNORE: dupes silently rejected via UNIQUE(idempotencyKey).
  // Variadic params form (real expo-sqlite supports both array + variadic; the in-memory
  // jest mock only handles variadic — production code uses variadic for portability).
  await d.runAsync(
    `INSERT OR IGNORE INTO outbox (idempotencyKey, payload) VALUES (?, ?)`,
    idempotencyKey,
    payload,
  );
}

let flushInFlight = false;

export async function flushPendingPoints(): Promise<{ flushed: number }> {
  if (flushInFlight) return { flushed: 0 };
  flushInFlight = true;
  try {
    const d = isWeb ? null : await db();
    const rows: OutboxRow[] = isWeb
      ? wq().head(50, 5)
      : await d!.getAllAsync<OutboxRow>(
          `SELECT id, idempotencyKey, payload, attempts, createdAt
             FROM outbox
            WHERE attempts < 5
            ORDER BY id ASC
            LIMIT 50`,
        );
    if (rows.length === 0) return { flushed: 0 };

    const deviceId = (await SecureStore.getItemAsync("device_id")) ?? "";
    const driverId = (await SecureStore.getItemAsync("driver_id")) ?? "";

    // Decode payloads → server-facing shape. Use the latest row's platformGuess
    // as the batch's hint (most-recent tab the user was on when this batch was queued).
    let lastPlatformGuess: string | null = null;
    const locations = rows.map((r) => {
      const decoded = JSON.parse(r.payload) as OutboxGpsPoint;
      lastPlatformGuess = decoded.platformGuess;
      return {
        latitude: decoded.latitude,
        longitude: decoded.longitude,
        accuracy: decoded.accuracy,
        speed: decoded.speed ?? undefined,
        capturedAt: decoded.capturedAt,
        idempotencyKey: r.idempotencyKey,
      };
    });

    try {
      await uploadLocations({
        deviceId,
        driverId,
        locations,
        platformGuess: lastPlatformGuess,
      });
      const ids = rows.map((r) => r.id);
      if (isWeb) {
        wq().remove(ids);
      } else {
        const placeholders = ids.map(() => "?").join(",");
        await d!.runAsync(`DELETE FROM outbox WHERE id IN (${placeholders})`, ...ids);
      }
      return { flushed: rows.length };
    } catch (e: any) {
      const ids = rows.map((r) => r.id);
      // attempts++ on every row in the batch; the give-up filter (attempts < 5) prevents
      // forever-retry. lastError column not in mock schema — keep mutation minimal.
      if (isWeb) {
        wq().bumpAttempts(ids);
      } else {
        const placeholders = ids.map(() => "?").join(",");
        await d!.runAsync(
          `UPDATE outbox SET attempts = attempts + 1 WHERE id IN (${placeholders})`,
          ...ids,
        );
      }
      return { flushed: 0 };
    }
  } finally {
    flushInFlight = false;
  }
}

// ─── Test-only seams ─────────────────────────────────────────────────────────
// Not part of the production API surface but exported so jest tests can assert
// table state without poking SQL through random helpers.

export async function _resetForTests(): Promise<void> {
  if (isWeb) {
    wq().clear();
    return;
  }
  const d = await db();
  await d.runAsync(`DELETE FROM outbox`);
}

export async function _countForTests(): Promise<number> {
  if (isWeb) return wq().count();
  const d = await db();
  const r = await d.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM outbox`,
  );
  return r?.count ?? 0;
}

export async function _allRowsForTests(): Promise<
  Array<{
    id: number;
    idempotencyKey: string;
    payload: string;
    attempts: number;
    createdAt: number;
  }>
> {
  if (isWeb) return wq().all();
  const d = await db();
  return d.getAllAsync(`SELECT id, idempotencyKey, payload, attempts, createdAt FROM outbox`);
}
