import { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { AlertTriangle, ClipboardList, Gift, Bell } from "lucide-react-native";
import { NavBar, Segmented, Screen } from "../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../src/theme";
import { mockNotifications } from "../src/mockData";
import type { NotificationCategory } from "../src/mockData";

type Tab = "ALL" | NotificationCategory;

const TABS: { value: Tab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "IMPORTANT", label: "Important" },
  { value: "OPS_TODO", label: "Ops" },
  { value: "BENEFITS", label: "Benefits" },
  { value: "OTHER", label: "Other" },
];

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [tab, setTab] = useState<Tab>("ALL");
  const [items, setItems] = useState(mockNotifications);

  const META: Record<NotificationCategory, { color: string; fill: string; Icon: any }> = {
    IMPORTANT: { color: c.red, fill: c.redFill, Icon: AlertTriangle },
    OPS_TODO: { color: c.orange, fill: c.orangeFill, Icon: ClipboardList },
    BENEFITS: { color: c.green, fill: c.greenFill, Icon: Gift },
    OTHER: { color: c.blue, fill: c.tintFill, Icon: Bell },
  };

  const filtered = useMemo(() => (tab === "ALL" ? items : items.filter((n) => n.category === tab)), [tab, items]);
  const markRead = useCallback((id: string) => setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const markAll = useCallback(() => setItems((prev) => prev.map((n) => ({ ...n, read: true }))), []);

  return (
    <Screen>
      <NavBar
        title="Notifications"
        trailing={<TouchableOpacity onPress={markAll}><Text style={[t.body, { color: c.tint }]}>Mark all</Text></TouchableOpacity>}
      />

      <View style={styles.segWrap}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Bell size={40} color={c.gray3} />
            <Text style={[t.headline, { marginTop: space.md }]}>You're all caught up</Text>
            <Text style={[t.subheadline, { color: c.secondaryLabel }]}>New notifications appear here.</Text>
          </View>
        ) : (
          filtered.map((n) => {
            const m = META[n.category];
            const { Icon } = m;
            return (
              <TouchableOpacity key={n.id} activeOpacity={0.7} style={[styles.card, !n.read && styles.cardUnread]} onPress={() => markRead(n.id)}>
                <View style={[styles.icon, { backgroundColor: m.fill }]}>
                  <Icon size={18} color={m.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.topRow}>
                    <Text style={[t.headline, { flex: 1 }]} numberOfLines={1}>{n.title}</Text>
                    {!n.read ? <View style={styles.dot} /> : null}
                  </View>
                  <Text style={[t.subheadline, styles.ar]} numberOfLines={1}>{n.titleAr}</Text>
                  <Text style={[t.footnote, { color: c.label, marginTop: 6 }]}>{n.body}</Text>
                  <Text style={[t.caption1, styles.ar, { marginTop: 3 }]}>{n.bodyAr}</Text>
                  <Text style={[t.caption1, { color: c.tertiaryLabel, marginTop: space.sm }]}>{timeAgo(n.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  segWrap: { paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  list: { padding: space.base, paddingBottom: space.xxxl, gap: space.md },
  card: { flexDirection: "row", gap: space.md, padding: space.base, backgroundColor: c.groupedSecondary, borderRadius: radius.card, ...continuous, ...shadow.card },
  cardUnread: { backgroundColor: c.unreadBg },
  icon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", ...continuous },
  topRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.tint },
  ar: { color: c.secondaryLabel, textAlign: "right", writingDirection: "rtl" },
  empty: { alignItems: "center", gap: 4, paddingTop: 100 },
});
