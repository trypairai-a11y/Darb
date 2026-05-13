/**
 * BatteryStatusBadge — compact health badge for the dashboard header.
 *
 * Wave 1 shipped real battery telemetry to the backend; Wave 3 surfaces it to the
 * courier so they can SEE whether the beacon is running and whether their phone has
 * enough juice for the rest of the shift. Per CON-mobile-gps-ux ("Battery and
 * permission UX is treated as a deliverable, not a checkbox"), couriers need
 * passive visibility into beacon health — not a buried diagnostics screen.
 *
 * Color semantics (must match StatusBadge palette elsewhere in the app):
 *   active  → green   (#16a34a)  beacon running, phone healthy
 *   paused  → orange  (#F97316)  courier explicitly paused the beacon
 *   error   → red     (#dc2626)  permission denied / beacon failed to start
 *
 * batteryLevel is the 0..1 fraction from expo-battery (matches heartbeatService
 * payload convention). We clamp + render as integer percent. Sub-15% phones get a
 * subtle red battery readout so couriers know to charge.
 */

import { StyleSheet, Text, View } from "react-native";

export type BeaconStatus = "active" | "paused" | "error";

export interface BatteryStatusBadgeProps {
  beaconStatus: BeaconStatus;
  batteryLevel: number; // 0..1 fraction from expo-battery
  isLowPowerMode?: boolean;
}

const STATUS_PRESET: Record<BeaconStatus, { color: string; label: string }> = {
  active: { color: "#16a34a", label: "GPS Active" },
  paused: { color: "#F97316", label: "GPS Paused" },
  error: { color: "#dc2626", label: "GPS Error" },
};

export function BatteryStatusBadge({
  beaconStatus,
  batteryLevel,
  isLowPowerMode = false,
}: BatteryStatusBadgeProps) {
  const preset = STATUS_PRESET[beaconStatus];
  const pct = Math.max(0, Math.min(1, batteryLevel)) * 100;
  const batteryColor = pct <= 15 ? "#dc2626" : "#666";

  return (
    <View
      style={[styles.badge, { borderColor: preset.color }]}
      accessibilityLabel={`Beacon ${preset.label}, battery ${pct.toFixed(0)} percent`}
    >
      <View style={[styles.dot, { backgroundColor: preset.color }]} />
      <Text style={[styles.label, { color: preset.color }]}>{preset.label}</Text>
      <Text style={[styles.battery, { color: batteryColor }]}>{pct.toFixed(0)}%</Text>
      {isLowPowerMode ? <Text style={styles.lowPower}>LP</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: "600" },
  battery: { fontSize: 12, marginLeft: 4 },
  lowPower: {
    fontSize: 10,
    fontWeight: "700",
    color: "#dc2626",
    marginLeft: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#fee2e2",
  },
});
