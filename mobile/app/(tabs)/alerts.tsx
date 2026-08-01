/**
 * alerts.tsx — the driver's notifications (client request, 2026-08-01).
 *
 * Deliberately NOT named notifications.tsx. Next builds the route's chunk to a
 * path containing the segment name, and ad and tracker blockers match on
 * segments like "notifications", "analytics" and "banner". The driver app ships
 * a web build at darb-driver.vercel.app, so a blocked chunk there is a blank
 * screen in production and a 200 from the server, which is exactly the failure
 * that cost the merchant portal its analytics page. The tab is labelled
 * Notifications; only the route segment is boring on purpose.
 *
 * Opening the screen marks everything read. That is the right default for a
 * feed a driver checks between drops: the alternative is a badge they have to
 * clear item by item while holding a bag.
 */

import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { BellOff, Banknote, Package, Wrench } from "lucide-react-native";
import {
  fetchMyNotifications,
  markNotificationsRead,
  type DriverNotification,
} from "../../src/api/client";
import { Card, LargeTitle, Screen } from "../../src/components/hig";
import { getLanguage } from "../../src/i18n/strings";
import { t as tr } from "../../src/i18n/strings";
import { useTheme, type Palette, space, radius, continuous } from "../../src/theme";

function iconFor(type: string, c: Palette) {
  if (type === "CASH_SETTLED") return <Banknote size={18} color={c.green} />;
  if (type === "ORDER_ASSIGNED") return <Package size={18} color={c.tint} />;
  return <Wrench size={18} color={c.gray} />;
}

/** Relative, because "3 min ago" is what a driver actually wants to know. */
function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return tr("alerts.just_now");
  if (mins < 60) return tr("alerts.mins_ago", { count: String(mins) });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return tr("alerts.hours_ago", { count: String(hrs) });
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function AlertsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const arabic = getLanguage() === "ar";

  const [items, setItems] = useState<DriverNotification[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchMyNotifications();
      setItems(res.data);
      setStatus("ready");
      // Fire and forget: failing to mark read must not blank the list the
      // driver came here to read.
      if (res.unread > 0) markNotificationsRead().catch(() => {});
    } catch {
      setStatus((s) => (s === "ready" ? s : "ready"));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gray} />}
      >
        <LargeTitle title={tr("alerts.title")} />

        {items.length === 0 && status === "ready" ? (
          <Card style={{ marginTop: space.lg }}>
            <View style={styles.emptyRow}>
              <BellOff size={20} color={c.gray} />
              <Text style={[t.subheadline, { color: c.secondaryLabel, flex: 1 }]}>
                {tr("alerts.empty")}
              </Text>
            </View>
          </Card>
        ) : null}

        {items.map((n) => (
          <View key={n.id} style={[styles.row, !n.read && { borderColor: c.tint }]}>
            <View style={styles.icon}>{iconFor(n.type, c)}</View>
            <View style={{ flex: 1 }}>
              <Text style={[t.headline, { fontSize: 15 }]}>
                {arabic && n.titleAr ? n.titleAr : n.title}
              </Text>
              <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2 }]}>
                {arabic && n.bodyAr ? n.bodyAr : n.message}
              </Text>
              <Text style={[t.footnote, { color: c.gray, marginTop: 4 }]}>
                {whenLabel(n.createdAt)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingBottom: space.xxxl },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.md,
    padding: space.base,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.gray4,
    backgroundColor: c.groupedBackground,
    ...continuous,
  },
  icon: { paddingTop: 2 },
});
