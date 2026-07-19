/**
 * format.ts — money + duration formatting for the Darb driver app.
 *
 * All money in the platform is KWD with 3 decimal places (Kuwaiti fils).
 * The canonical rendering is "KD 12.500" — `KD` prefix, space, 3dp.
 */

export function formatKwd(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  const safe = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `KD ${safe.toFixed(3)}`;
}

/** "4m 27s" / "27s" / "1h 04m" — human duration from milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** "mm:ss" countdown rendering (for SLA banners). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
