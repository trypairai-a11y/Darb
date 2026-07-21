/**
 * Heartbeat service — periodic device telemetry post.
 *
 * Replaces the legacy `dashboard.tsx` 15-min loop that hardcoded `batteryLevel: 1.0` and
 * `appVersion: "1.0.0"`. The Device model on the backend already has a `batteryLevel`
 * column; populating it correctly lets the AI agent flag battery-DoS scenarios where a
 * misbehaving courier app is draining the phone faster than expected.
 *
 * Heartbeat is best-effort: a 4xx/5xx from the backend is logged-and-swallowed. Unlike
 * GPS points, heartbeat carries no business-critical state — the next ping in 15 minutes
 * will overwrite anything we missed.
 *
 * Fields:
 *   - batteryLevel   — 0.0..1.0 from expo-battery (NOT the hardcoded 1.0 the legacy code used)
 *   - appVersion     — semantic version from expo-application nativeApplicationVersion
 *   - isLowPowerMode — iOS low-power mode flag; influences battery telemetry interpretation
 *   - platformGuess  — tier-3 hint, identical to the one attached to GPS uploads
 */

import * as Application from "expo-application";
import * as Battery from "expo-battery";
import * as SecureStore from "./deviceStorage";
import { heartbeat } from "../api/client";
import { getLastTab } from "./platformGuess";

export async function sendHeartbeat(): Promise<void> {
  // Read real battery telemetry. Fall back to safe defaults if the native module
  // is missing (e.g. running in jest-expo where the battery mock might throw).
  const [batteryLevel, isLowPower] = await Promise.all([
    Battery.getBatteryLevelAsync().catch(() => 1.0),
    Battery.isLowPowerModeEnabledAsync().catch(() => false),
  ]);

  const appVersion = Application.nativeApplicationVersion ?? "1.0.0";
  const deviceId = (await SecureStore.getItemAsync("device_id")) ?? "";

  await heartbeat({
    deviceId,
    batteryLevel,
    appVersion,
    isLowPowerMode: isLowPower,
    platformGuess: getLastTab(),
  }).catch(() => {
    // Telemetry only — failure swallowed; next 15-min tick retries. Backend will
    // reject with 401 if deviceId is empty, but the call shape is still correct.
  });
}
