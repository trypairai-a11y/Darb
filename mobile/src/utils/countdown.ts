/**
 * countdown.ts — server-clock countdown math.
 *
 * The offer countdown and SLA banners must NEVER trust the device clock alone:
 * courier phones drift (some deliberately, to game timers). Every /state
 * response carries `serverTime`; we keep a running skew and compute remaining
 * time against the *server's* now.
 *
 *   clockSkewMs   = serverTime - deviceNow      (positive ⇒ device is behind)
 *   serverNow     = deviceNow + clockSkewMs
 *   remainingMs   = expiresAt - serverNow
 */

/** Skew between server clock and device clock at response time. */
export function computeClockSkewMs(serverTimeIso: string, deviceNow: number = Date.now()): number {
  const server = Date.parse(serverTimeIso);
  if (!Number.isFinite(server)) return 0;
  return server - deviceNow;
}

/** Milliseconds remaining until `expiresAtIso` on the SERVER's clock. Clamped ≥ 0. */
export function remainingMs(
  expiresAtIso: string,
  clockSkewMs: number,
  deviceNow: number = Date.now(),
): number {
  const expires = Date.parse(expiresAtIso);
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, expires - (deviceNow + clockSkewMs));
}

/**
 * Signed variant for SLA banners: negative when past the deadline
 * (caller renders "Overdue by X").
 */
export function remainingMsSigned(
  deadlineIso: string,
  clockSkewMs: number,
  deviceNow: number = Date.now(),
): number {
  const deadline = Date.parse(deadlineIso);
  if (!Number.isFinite(deadline)) return 0;
  return deadline - (deviceNow + clockSkewMs);
}
