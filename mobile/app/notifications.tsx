import { useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, AlertTriangle, ClipboardList, Gift, Bell } from "lucide-react-native";
import { mockNotifications } from "../src/mockData";
import type { NotificationCategory } from "../src/mockData";

type Tab = "ALL" | NotificationCategory;

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "IMPORTANT", label: "Important" },
  { key: "OPS_TODO", label: "Ops to-do" },
  { key: "BENEFITS", label: "Benefits" },
  { key: "OTHER", label: "Others" },
];

const CATEGORY_META: Record<NotificationCategory, { color: string; bg: string; Icon: any }> = {
  IMPORTANT: { color: "#D92D20", bg: "#FDECEA", Icon: AlertTriangle },
  OPS_TODO: { color: "#7A4E00", bg: "#FFF8E8", Icon: ClipboardList },
  BENEFITS: { color: "#007A3D", bg: "#E5F7ED", Icon: Gift },
  OTHER: { color: "#3A6EA5", bg: "#EAF1FA", Icon: Bell },
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ALL");
  const [items, setItems] = useState(mockNotifications);

  const filtered = useMemo(
    () => (tab === "ALL" ? items : items.filter((n) => n.category === tab)),
    [tab, items]
  );

  const unreadByTab = useCallback(
    (t: Tab) =>
      (t === "ALL" ? items : items.filter((n) => n.category === t)).filter((n) => !n.read).length,
    [items]
  );

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#1d1d1f" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={styles.markAll}>Mark all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = unreadByTab(t.key);
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                {count > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Bell size={40} color="#c7c7cc" />
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyBody}>New notifications will appear here.</Text>
          </View>
        ) : (
          filtered.map((n) => {
            const meta = CATEGORY_META[n.category];
            const { Icon } = meta;
            return (
              <TouchableOpacity
                key={n.id}
                activeOpacity={0.7}
                style={[styles.card, !n.read && styles.cardUnread]}
                onPress={() => markRead(n.id)}
              >
                <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
                  <Icon size={20} color={meta.color} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{n.title}</Text>
                    {!n.read ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.cardTitleAr} numberOfLines={1}>{n.titleAr}</Text>
                  <Text style={styles.cardText}>{n.body}</Text>
                  <Text style={styles.cardTextAr}>{n.bodyAr}</Text>
                  <Text style={styles.cardTime}>{timeAgo(n.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f5f7" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1d1d1f", flex: 1 },
  markAll: { fontSize: 14, color: "#007A3D", fontWeight: "600" },
  tabsWrap: { borderBottomWidth: 1, borderBottomColor: "#e5e5ea" },
  tabs: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e5ea",
  },
  tabActive: { backgroundColor: "#1d1d1f", borderColor: "#1d1d1f" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#6e6e73" },
  tabTextActive: { color: "#fff" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#D92D20", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  tabBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 36, gap: 12 },
  card: {
    flexDirection: "row", gap: 12, padding: 14,
    backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#e5e5ea",
  },
  cardUnread: { borderColor: "#cfe8da", backgroundColor: "#fbfffd" },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1d1d1f", flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#007A3D" },
  cardTitleAr: { fontSize: 13, fontWeight: "600", color: "#6e6e73", marginTop: 1, textAlign: "right", writingDirection: "rtl" },
  cardText: { fontSize: 13, color: "#3a3a3c", marginTop: 6, lineHeight: 18 },
  cardTextAr: { fontSize: 12, color: "#8e8e93", marginTop: 4, lineHeight: 18, textAlign: "right", writingDirection: "rtl" },
  cardTime: { fontSize: 11, color: "#a1a1a6", marginTop: 8 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 100, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#1d1d1f", marginTop: 8 },
  emptyBody: { fontSize: 14, color: "#8e8e93" },
});
