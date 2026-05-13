/**
 * Phase 7 Wave 0 RED test — DarbEventType union extension.
 *
 * Wave 1 must extend the union in backend/src/services/eventBus.ts:
 *
 *   export type DarbEventType =
 *     | "alert" | "violation" | ... existing ...
 *     | "gps_point"
 *     | "online_session_update";
 *
 * Today the union does NOT include these literals. The two `const _pinN`
 * assignments below are compile-time assertions that the literal type
 * is assignable to DarbEventType — they FAIL under ts-jest with TS2322
 * until Wave 1 widens the union. That's the RED state at the compile
 * level: the whole test file fails to load, the suite is reported FAIL,
 * Jest counts a failed test run.
 *
 * Type-assignability errors (TS2322) fire regardless of the
 * `strict: false` flag in jest.config.js's ts-jest options — strict
 * only governs noImplicitAny / strictNullChecks / etc. Hence the file
 * fails to compile and the test never reaches runtime today.
 *
 * Wave 1 turns it GREEN by widening the union; the assignments compile;
 * the runtime expects pass.
 *
 * REQ-floor-live-map.
 */

import type { DarbEventType } from "../../services/eventBus";

// Compile-time pin — fails TS2322 today (literal not in union), then
// compiles cleanly once Wave 1 widens DarbEventType.
const _pin1: DarbEventType = "gps_point";
const _pin2: DarbEventType = "online_session_update";

describe("Phase 7 / REQ-floor-live-map: DarbEventType union extension", () => {
  test("DarbEventType union includes 'gps_point' and 'online_session_update' literals", () => {
    expect(_pin1).toBe("gps_point");
    expect(_pin2).toBe("online_session_update");
  });

  test("the literals are usable as switch-statement discriminants", () => {
    function handle(t: DarbEventType): string {
      if (t === "gps_point") return "ok-gps";
      if (t === "online_session_update") return "ok-session";
      return "other";
    }
    expect(handle(_pin1)).toBe("ok-gps");
    expect(handle(_pin2)).toBe("ok-session");
  });
});

// RED — TS2322 compile failure until Wave 1 extends DarbEventType.
// The two const _pinN bindings at module-load time are the compile-time
// gate. Wave 1 widens the union and the file compiles cleanly; the
// runtime assertions then pass.
