import { useState, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  SafeAreaView, RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import * as Battery from "expo-battery";
import { agentFetch } from "../../src/api/client";
import { startBeacon, stopBeacon } from "../../src/services/locationService";
import { sendHeartbeat } from "../../src/services/heartbeatService";
import { PermissionRationale } from "../../src/components/PermissionRationale";
import { BatteryStatusBadge, type BeaconStatus } from "../../src/components/BatteryStatusBadge";

interface DashboardStats {
  ordersToday: number;
  onlineMinutes: number;
  completionRate: number;
  rating: number;
}

// Heartbeat cadence — RESEARCH.md "system architecture" diagram puts this at 5 min,
// vs the legacy 15-min loop. 5 min gives the backend's battery-DoS detector enough
// resolution to flag a misbehaving app within one shift segment.
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

// Refresh the battery readout for the BatteryStatusBadge at the same cadence as the
// heartbeat. Keeps the displayed % from drifting too far from reality without spinning
// up a second timer.
const BATTERY_REFRESH_MS = HEARTBEAT_INTERVAL_MS;

export default function DashboardScreen() {
  const router = useRouter();
  const [onShift, setOnShift] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    ordersToday: 0,
    onlineMinutes: 0,
    completionRate: 0,
    rating: 0,
  });

  // Wave 3: surface beacon health + real battery to the courier. Default state
  // is `paused` (beacon hasn't been started yet) so the badge reads "GPS Paused"
  // before the courier taps Start Shift.
  const [beaconStatus, setBeaconStatus] = useState<BeaconStatus>("paused");
  const [batteryLevel, setBatteryLevel] = useState(1.0);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const [showPermission, setShowPermission] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await agentFetch<DashboardStats>("/api/agent/stats");
      setStats(data);
    } catch {
      // Stats fetch failed silently — keep previous values
    }
  }, []);

  const refreshBattery = useCallback(async () => {
    try {
      const [lvl, lpm] = await Promise.all([
        Battery.getBatteryLevelAsync().catch(() => 1.0),
        Battery.isLowPowerModeEnabledAsync().catch(() => false),
      ]);
      setBatteryLevel(lvl);
      setIsLowPowerMode(lpm);
    } catch {
      // expo-battery may be missing in non-device contexts (web preview); leave
      // the last known reading in place.
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), refreshBattery()]);
    setRefreshing(false);
  }, [fetchStats, refreshBattery]);

  useEffect(() => {
    fetchStats();
    refreshBattery();
  }, [fetchStats, refreshBattery]);

  // Heartbeat every 5 minutes via the new heartbeatService. Replaces the legacy
  // inline heartbeat({deviceId, batteryLevel: 1.0, appVersion: "1.0.0"}) call —
  // sendHeartbeat() reads the real battery + app version + low-power flag from
  // the native modules.
  useEffect(() => {
    sendHeartbeat().catch(() => {});
    const timer = setInterval(() => {
      sendHeartbeat().catch(() => {});
      refreshBattery();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshBattery]);

  // Standalone battery refresh tick — without this the badge would only update
  // alongside heartbeats. Keeping the two cadences identical reduces battery
  // drain from extra timers but stays decoupled in case we ever want a different
  // UX cadence than the telemetry cadence.
  useEffect(() => {
    const timer = setInterval(refreshBattery, BATTERY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshBattery]);

  const handleToggleShift = useCallback(async () => {
    if (onShift) {
      router.push({ pathname: "/selfie", params: { type: "clock_out" } });
      await stopBeacon();
      setBeaconStatus("paused");
      setOnShift(false);
      return;
    }
    // Cold start: open the rationale modal FIRST. The OS permission dialogs only
    // appear after the courier acknowledges the rationale. This is the key 70%+
    // iOS-grant-rate improvement per RESEARCH.md Pitfall 2.
    setShowPermission(true);
  }, [onShift, router]);

  const onPermissionComplete = useCallback(async (granted: boolean) => {
    setShowPermission(false);
    if (!granted) {
      Alert.alert(
        "Permission Required",
        "Please grant 'Allow All The Time' location permission to start your shift.",
      );
      setBeaconStatus("error");
      return;
    }
    // Both perms granted + startBeacon succeeded inside the rationale modal.
    // Navigate to clock-in selfie + flip onShift true.
    router.push({ pathname: "/selfie", params: { type: "clock_in" } });
    setBeaconStatus("active");
    setOnShift(true);
  }, [router]);

  function formatHours(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F97316" />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.greeting}>Good day, Driver</Text>
          <BatteryStatusBadge
            beaconStatus={beaconStatus}
            batteryLevel={batteryLevel}
            isLowPowerMode={isLowPowerMode}
          />
        </View>

        <View style={styles.statusCard}>
          <View style={[styles.statusDot, { backgroundColor: onShift ? "#16a34a" : "#dc2626" }]} />
          <Text style={styles.statusText}>{onShift ? "On Shift" : "Off Shift"}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.ordersToday}</Text>
            <Text style={styles.statLabel}>Orders Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatHours(stats.onlineMinutes)}</Text>
            <Text style={styles.statLabel}>Time on Shift</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.completionRate > 0 ? `${stats.completionRate}%` : "--"}
            </Text>
            <Text style={styles.statLabel}>Completion Rate</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.rating > 0 ? stats.rating.toFixed(1) : "--"}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.shiftButton, onShift ? styles.shiftButtonEnd : styles.shiftButtonStart]}
          onPress={handleToggleShift}
        >
          <Text style={styles.shiftButtonText}>
            {onShift ? "End Shift" : "Start Shift"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <PermissionRationale visible={showPermission} onComplete={onPermissionComplete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f5f7" },
  container: { flex: 1, padding: 24 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 24,
    gap: 12,
  },
  greeting: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  statusCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 16, padding: 20,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 18, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 20,
    alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "700" },
  statLabel: { fontSize: 12, color: "#86868b", marginTop: 4 },
  shiftButton: {
    borderRadius: 16, padding: 20, alignItems: "center", marginTop: 32, marginBottom: 40,
  },
  shiftButtonStart: { backgroundColor: "#16a34a" },
  shiftButtonEnd: { backgroundColor: "#dc2626" },
  shiftButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
