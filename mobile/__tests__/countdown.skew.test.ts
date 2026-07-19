/**
 * countdown — remaining-time math against the SERVER clock.
 *
 * The offer ring and SLA banners must be immune to device-clock drift:
 * remaining = expiresAt - (deviceNow + clockSkewMs), where
 * clockSkewMs = serverTime - deviceNow at the last /state response.
 */

import { computeClockSkewMs, remainingMs, remainingMsSigned } from "../src/utils/countdown";

const T0 = Date.parse("2026-07-19T10:00:00.000Z");

describe("computeClockSkewMs", () => {
  test("positive skew when the device clock is behind the server", () => {
    expect(computeClockSkewMs("2026-07-19T10:00:05.000Z", T0)).toBe(5_000);
  });

  test("negative skew when the device clock is ahead of the server", () => {
    expect(computeClockSkewMs("2026-07-19T09:59:50.000Z", T0)).toBe(-10_000);
  });

  test("unparseable server time → 0 (no correction)", () => {
    expect(computeClockSkewMs("garbage", T0)).toBe(0);
  });
});

describe("remainingMs with injected skew", () => {
  const expiresAt = "2026-07-19T10:00:15.000Z"; // 15s offer window from T0

  test("zero skew: plain wall-clock remaining", () => {
    expect(remainingMs(expiresAt, 0, T0)).toBe(15_000);
    expect(remainingMs(expiresAt, 0, T0 + 11_000)).toBe(4_000);
  });

  test("device 10s AHEAD of server: skew rescues the countdown", () => {
    // Server said its now == T0, device thinks it's T0+10s → skew = -10s.
    const skew = computeClockSkewMs("2026-07-19T10:00:00.000Z", T0 + 10_000);
    expect(skew).toBe(-10_000);
    // Without skew the courier would only see 5s; with skew: full 15s.
    expect(remainingMs(expiresAt, skew, T0 + 10_000)).toBe(15_000);
  });

  test("device 30s BEHIND server: offer already expired despite local clock", () => {
    const skew = computeClockSkewMs("2026-07-19T10:00:30.000Z", T0); // +30s
    expect(remainingMs(expiresAt, skew, T0)).toBe(0); // clamped
  });

  test("clamps at zero, never negative", () => {
    expect(remainingMs(expiresAt, 0, T0 + 60_000)).toBe(0);
  });

  test("unparseable expiry → 0 (fail-closed: expired)", () => {
    expect(remainingMs("not-a-date", 0, T0)).toBe(0);
  });
});

describe("remainingMsSigned (SLA banners)", () => {
  const deadline = "2026-07-19T10:30:00.000Z";

  test("positive before the deadline", () => {
    expect(remainingMsSigned(deadline, 0, T0)).toBe(30 * 60_000);
  });

  test("negative once overdue (renders 'Overdue by X')", () => {
    expect(remainingMsSigned(deadline, 0, T0 + 31 * 60_000)).toBe(-60_000);
  });

  test("skew shifts the verdict", () => {
    // Device thinks there is 1 min left, but server clock is 2 min ahead.
    expect(remainingMsSigned(deadline, 120_000, T0 + 29 * 60_000)).toBe(-60_000);
  });
});
