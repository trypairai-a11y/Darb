/**
 * Per-device rate limit middleware for mobile agent endpoints.
 *
 * The mobile agent identifies itself by `deviceId` in the JSON body (not by
 * `req.ip`, which is shared across all couriers on the same NAT). We key
 * `express-rate-limit` on `deviceId` so a misbehaving device can't starve
 * other couriers, and so each driver gets independent quota.
 *
 *   - agentLocationRateLimit  → 200 POSTs / 5 min   (covers normal GPS batch flow)
 *   - agentUploadRateLimit    → 30  POSTs / 10 min  (delivery-photo upload-url requests)
 *
 * 200 / 5 min lets the mobile outbox flush ~40/min sustained, which is
 * 16× the steady-state rate (one batch every 15s) and comfortable for
 * burst recovery after a long offline stretch. 30 / 10 min caps photo
 * uploads at one every ~20 seconds, well above realistic courier cadence.
 *
 * Threat: T-05-02-06 (DoS via location spam) + T-05-02-07 (outbox poisoning).
 */
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

// Resolve the rate-limit key from the JSON body's deviceId; fall back to req.ip
// for unauthenticated probes so we still throttle malformed traffic. The IPv6
// fallback uses `ipKeyGenerator` so IPv6 users can't bypass limits by picking
// a different host bit per request (each /64 collapses to one key).
const keyFromBody = (req: Request) => {
  const deviceId = (req.body as any)?.deviceId;
  if (typeof deviceId === "string" && deviceId.length > 0) return deviceId;
  return ipKeyGenerator(req.ip ?? "");
};

export const agentLocationRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 200,
  keyGenerator: keyFromBody,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate-limited" },
});

export const agentUploadRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 30,
  keyGenerator: keyFromBody,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate-limited" },
});
