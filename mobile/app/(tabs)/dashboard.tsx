import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, CreditCard, LifeBuoy, ChevronRight, Bell } from "lucide-react-native";
import { AiSuggestionFeed } from "../../src/components/AiSuggestionFeed";
import { mockProfile, mockDashboardStats, mockNotifications } from "../../src/mockData";

export default function DashboardScreen() {
  const router = useRouter();
  const [onShift, setOnShift] = useState(mockDashboardStats.onShift);
  const [refreshing, setRefreshing] = useState(false);

  const profile = mockProfile;
  const stats = mockDashboardStats;
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const handleToggleShift = useCallback(() => {
    setOnShift((prev) => !prev);
  }, []);

  function formatMoney(value: number): string {
    return `${Number(value || 0).toFixed(3)} KD`;
  }

  function formatTime(value?: string): string {
    if (!value) return "Not scheduled";
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const driverName = profile.name;
  const currentShift = stats.activeShift;
  const shiftArea = currentShift?.area || profile.zone || "Assigned zone";
  const shiftWindow = currentShift
    ? `${formatTime(currentShift.startTime)} to ${formatTime(currentShift.endTime)}`
    : "No shift scheduled";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007A3D" />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.identity}
            activeOpacity={0.7}
            onPress={() => router.push("/profile")}
          >
            <Text style={styles.greeting}>Good day</Text>
            <View style={styles.nameRow}>
              <Text style={styles.driverName} numberOfLines={1}>{driverName}</Text>
              <ChevronRight size={22} color="#c7c7cc" />
            </View>
            <Text style={styles.driverMeta}>
              {[profile.platform, profile.zone].filter(Boolean).join(" · ")}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.bellButton}
              activeOpacity={0.7}
              onPress={() => router.push("/notifications")}
            >
              <Bell size={22} color="#1d1d1f" />
              {unreadCount > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <View style={[styles.onlinePill, onShift ? styles.onlinePillOn : styles.onlinePillOff]}>
              <View style={[styles.onlineDot, { backgroundColor: onShift ? "#16a34a" : "#8e8e93" }]} />
              <Text style={[styles.onlineText, { color: onShift ? "#16a34a" : "#8e8e93" }]}>
                {onShift ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        <AiSuggestionFeed />

        <View style={styles.shiftCard}>
          <View style={styles.shiftTopRow}>
            <View>
              <Text style={styles.cardLabel}>{onShift ? "On shift now" : "Next shift"}</Text>
              <Text style={styles.shiftTitle}>{shiftArea}</Text>
            </View>
            <View style={[styles.statusPill, onShift ? styles.statusPillActive : styles.statusPillIdle]}>
              <Text style={[styles.statusPillText, onShift ? styles.statusPillTextActive : styles.statusPillTextIdle]}>
                {onShift ? "Live" : "Ready"}
              </Text>
            </View>
          </View>

          <Text style={styles.shiftWindow}>{shiftWindow}</Text>

          <TouchableOpacity
            style={[styles.shiftButton, onShift ? styles.shiftButtonEnd : styles.shiftButtonStart]}
            onPress={handleToggleShift}
          >
            <Text style={styles.shiftButtonText}>{onShift ? "End shift" : "Start shift"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsGrid}>
          <Metric label="Score" value={stats.score ? String(stats.score) : "--"} />
        </View>

        {stats.cashDue > 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Cash to settle</Text>
            <Text style={styles.noticeText}>{formatMoney(stats.cashDue)}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>More</Text>
        <View style={styles.actionList}>
          <QuickAction
            icon={<CreditCard size={20} color="#007A3D" />}
            title="Score"
            body={`${stats.completionRate}% delivery score`}
            onPress={() => router.push("/(tabs)/points")}
          />
          <QuickAction
            icon={<LifeBuoy size={20} color="#007A3D" />}
            title="Support"
            body={stats.openTickets > 0 ? `${stats.openTickets} open ticket` : "Report a problem"}
            onPress={() => router.push("/(tabs)/tickets")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  title,
  body,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}>{icon}</View>
      <View style={styles.quickText}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text style={styles.quickBody}>{body}</Text>
      </View>
      <ArrowRight size={18} color="#8e8e93" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f5f7" },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 18,
    gap: 12,
  },
  identity: { flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bellButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e5ea",
    alignItems: "center", justifyContent: "center",
  },
  bellBadge: {
    position: "absolute", top: -3, right: -3,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: "#D92D20", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#f5f5f7",
  },
  bellBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  greeting: { fontSize: 15, color: "#6e6e73", marginBottom: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  driverName: { fontSize: 30, fontWeight: "700", color: "#1d1d1f", lineHeight: 36, flexShrink: 1 },
  driverMeta: { fontSize: 13, color: "#6e6e73", marginTop: 4, lineHeight: 18 },
  onlinePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, backgroundColor: "#fff",
  },
  onlinePillOn: { borderColor: "#16a34a" },
  onlinePillOff: { borderColor: "#d1d1d6" },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: "600" },
  shiftCard: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  shiftTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  cardLabel: { fontSize: 12, color: "#6e6e73", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" },
  shiftTitle: { fontSize: 24, fontWeight: "700", color: "#1d1d1f", lineHeight: 30 },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusPillActive: { backgroundColor: "#E5F7ED" },
  statusPillIdle: { backgroundColor: "#F2F2F7" },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  statusPillTextActive: { color: "#007A3D" },
  statusPillTextIdle: { color: "#6e6e73" },
  shiftWindow: { fontSize: 15, color: "#6e6e73", marginTop: 10, marginBottom: 18 },
  shiftButton: { borderRadius: 18, padding: 16, alignItems: "center" },
  shiftButtonStart: { backgroundColor: "#007A3D" },
  shiftButtonEnd: { backgroundColor: "#D92D20" },
  shiftButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  metricCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  metricValue: { fontSize: 24, fontWeight: "700", color: "#1d1d1f" },
  metricLabel: { fontSize: 12, color: "#6e6e73", marginTop: 4 },
  notice: {
    marginTop: 14,
    backgroundColor: "#FFF8E8",
    borderColor: "#F6D58D",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  noticeTitle: { fontSize: 15, color: "#7A4E00", fontWeight: "600" },
  noticeText: { fontSize: 16, color: "#7A4E00", fontWeight: "700" },
  summaryCard: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    padding: 16,
    gap: 12,
  },
  summaryTitle: { fontSize: 18, fontWeight: "700", color: "#1d1d1f", marginBottom: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  summaryLabel: { fontSize: 14, color: "#6e6e73", flex: 1 },
  summaryValue: { fontSize: 14, color: "#1d1d1f", fontWeight: "600", flex: 1.2, textAlign: "right" },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#1d1d1f", marginTop: 26, marginBottom: 12 },
  actionList: { backgroundColor: "#fff", borderRadius: 24, borderWidth: 1, borderColor: "#e5e5ea", overflow: "hidden" },
  quickAction: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: "#f2f2f7" },
  quickIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E5F7ED", alignItems: "center", justifyContent: "center" },
  quickText: { flex: 1 },
  quickTitle: { fontSize: 16, fontWeight: "700", color: "#1d1d1f" },
  quickBody: { fontSize: 13, color: "#6e6e73", marginTop: 2, lineHeight: 18 },
});
