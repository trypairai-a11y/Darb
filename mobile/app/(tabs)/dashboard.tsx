import { useState, useCallback, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Trophy, LifeBuoy, Bell, MapPin, ChevronRight } from "lucide-react-native";
import { AiSuggestionFeed } from "../../src/components/AiSuggestionFeed";
import { Screen, Card, ListGroup, ListRow, Button, Pill } from "../../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";
import { mockProfile, mockDashboardStats, mockNotifications } from "../../src/mockData";

export default function DashboardScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [onShift, setOnShift] = useState(mockDashboardStats.onShift);
  const [refreshing, setRefreshing] = useState(false);

  const profile = mockProfile;
  const stats = mockDashboardStats;
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);
  const handleToggleShift = useCallback(() => setOnShift((p) => !p), []);

  const formatHours = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);
  const formatMoney = (v: number) => `${Number(v || 0).toFixed(3)} KD`;
  const formatTime = (v?: string) =>
    v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not scheduled";

  const shift = stats.activeShift;
  const shiftArea = shift?.area || profile.zone || "Assigned zone";
  const shiftWindow = shift ? `${formatTime(shift.startTime)} – ${formatTime(shift.endTime)}` : "No shift scheduled";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <View style={styles.header}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.6} onPress={() => router.push("/profile")}>
            <Text style={[t.subheadline, { color: c.secondaryLabel }]}>Good day</Text>
            <View style={styles.nameRow}>
              <Text style={t.largeTitle} numberOfLines={1}>{profile.name}</Text>
              <ChevronRight size={24} color={c.gray3} />
            </View>
            <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 2 }]}>
              {[profile.platform, profile.zone].filter(Boolean).join(" · ")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bell} activeOpacity={0.7} onPress={() => router.push("/notifications")}>
            <Bell size={22} color={c.label} />
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={[t.caption2, { color: c.white, fontWeight: "700" }]}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <AiSuggestionFeed />

        <Card style={{ marginTop: space.xs }}>
          <View style={styles.shiftTop}>
            <View style={{ flex: 1 }}>
              <Text style={[t.footnote, { color: c.secondaryLabel, textTransform: "uppercase", letterSpacing: 0.4 }]}>
                {onShift ? "On shift now" : "Next shift"}
              </Text>
              <Text style={[t.title2, { marginTop: 4 }]}>{shiftArea}</Text>
              <View style={styles.shiftMeta}>
                <MapPin size={14} color={c.secondaryLabel} />
                <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{shiftWindow}</Text>
              </View>
            </View>
            <Pill label={onShift ? "Live" : "Ready"} color={onShift ? c.tint : c.secondaryLabel} fill={onShift ? c.tintFill : c.tertiaryFill} />
          </View>
          <Button title={onShift ? "End shift" : "Start shift"} variant={onShift ? "destructive" : "filled"} onPress={handleToggleShift} style={{ marginTop: space.base }} />
        </Card>

        <View style={styles.grid}>
          <Metric label="Orders today" value={String(stats.ordersToday)} />
          <Metric label="Time live" value={formatHours(stats.onlineMinutes)} />
          <Metric label="Today cash" value={formatMoney(stats.todayCash)} />
          <Metric label="Score" value={stats.score ? String(stats.score) : "—"} />
        </View>

        {stats.cashDue > 0 ? (
          <View style={styles.notice}>
            <View style={{ flex: 1 }}>
              <Text style={[t.subheadline, { color: c.warnLabel, fontWeight: "600" }]}>Cash to settle</Text>
              <Text style={[t.footnote, { color: c.warnLabel2, marginTop: 1 }]}>Hand in at the hub at shift end</Text>
            </View>
            <Text style={[t.title3, { color: c.warnLabel, fontWeight: "700" }]}>{formatMoney(stats.cashDue)}</Text>
          </View>
        ) : null}

        <ListGroup header="More" style={{ marginTop: space.sm }}>
          <ListRow icon={<Trophy size={17} color={c.tint} />} title="Darb Points" detail={`${stats.completionRate}%`} chevron onPress={() => router.push("/(tabs)/points")} />
          <ListRow icon={<LifeBuoy size={17} color={c.tint} />} title="Support" detail={stats.openTickets > 0 ? `${stats.openTickets} open` : undefined} chevron onPress={() => router.push("/(tabs)/tickets")} />
        </ListGroup>
      </ScrollView>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.metric}>
      <Text style={[t.title1, { letterSpacing: -0.5 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xxxl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.base },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  bell: {
    width: 40, height: 40, borderRadius: radius.capsule, backgroundColor: c.groupedSecondary,
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  bellBadge: {
    position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, backgroundColor: c.red, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: c.groupedBackground,
  },
  shiftTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  shiftMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.md },
  metric: {
    width: "47.8%", flexGrow: 1, backgroundColor: c.groupedSecondary, borderRadius: radius.card,
    padding: space.base, ...continuous, ...shadow.card,
  },
  notice: {
    flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md,
    backgroundColor: c.warnBg, borderRadius: radius.card, padding: space.base, ...continuous,
  },
});
