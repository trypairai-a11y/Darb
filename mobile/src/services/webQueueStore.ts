/**
 * webQueueStore — localStorage-persisted FIFO queue used as the web fallback for
 * the expo-sqlite outboxes (outbox.ts / eventOutbox.ts).
 *
 * expo-sqlite is not reliably available in this web setup, so on Platform.OS ===
 * "web" the outboxes swap their storage layer for this class while keeping their
 * public API (enqueue... / flush...) byte-identical for callers.
 *
 * Semantics mirrored from the SQLite schema:
 *   - UNIQUE(idempotencyKey) via insertIgnore (silent dupe rejection)
 *   - monotonically increasing integer ids → strict FIFO via head()
 *   - attempts counter with optional give-up filter (maxAttempts)
 *
 * Persistence is BEST EFFORT: every mutation is mirrored to localStorage inside
 * try/catch (private browsing / quota errors degrade to in-memory only). A page
 * reload restores whatever last persisted.
 */

export interface WebQueueRow {
  id: number;
  idempotencyKey: string;
  kind: string;
  payload: string;
  attempts: number;
  createdAt: number;
}

export class WebQueue {
  private rows: WebQueueRow[] = [];
  private nextId = 1;

  constructor(private readonly storageKey: string) {
    this.load();
  }

  private load(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { rows?: WebQueueRow[]; nextId?: number };
      this.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      this.nextId =
        typeof parsed.nextId === "number"
          ? parsed.nextId
          : this.rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    } catch {
      this.rows = [];
      this.nextId = 1;
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({ rows: this.rows, nextId: this.nextId }),
      );
    } catch {
      /* best effort — stays in memory */
    }
  }

  /** INSERT OR IGNORE equivalent. Returns false when the key already exists. */
  insertIgnore(idempotencyKey: string, payload: string, kind = ""): boolean {
    if (this.rows.some((r) => r.idempotencyKey === idempotencyKey)) return false;
    this.rows.push({
      id: this.nextId++,
      idempotencyKey,
      kind,
      payload,
      attempts: 0,
      createdAt: Date.now(),
    });
    this.persist();
    return true;
  }

  /** Head-of-queue batch, optionally filtered by attempts < maxAttempts. */
  head(limit: number, maxAttempts?: number): WebQueueRow[] {
    const eligible =
      maxAttempts == null ? this.rows : this.rows.filter((r) => r.attempts < maxAttempts);
    return eligible.slice(0, limit).map((r) => ({ ...r }));
  }

  remove(ids: number[]): void {
    const drop = new Set(ids);
    this.rows = this.rows.filter((r) => !drop.has(r.id));
    this.persist();
  }

  bumpAttempts(ids: number[]): void {
    const bump = new Set(ids);
    for (const r of this.rows) if (bump.has(r.id)) r.attempts += 1;
    this.persist();
  }

  setPayload(id: number, payload: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) {
      row.payload = payload;
      this.persist();
    }
  }

  count(): number {
    return this.rows.length;
  }

  all(): WebQueueRow[] {
    return this.rows.map((r) => ({ ...r }));
  }

  clear(): void {
    this.rows = [];
    this.persist();
  }
}
