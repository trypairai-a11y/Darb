import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Package } from "lucide-react-native";
import { fetchMyOrders, type OrderRecord } from "../../src/api/client";
import { LargeTitle, Screen } from "../../src/components/hig";
import { formatKwd } from "../../src/i18n/format";
import { t as tr } from "../../src/i18n/strings";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";

const DONE_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const BAD_STATUSES = new Set(["FAILED", "CANCELLED"]);

function statusColor(status: string, c: Palette): string {
  const s = (status || "").toUpperCase();
  if (DONE_STATUSES.has(s)) return c.green;
  if (BAD_STATUSES.has(s)) return c.red;
  return c.orange;
}

export default function HistoryScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMyOrders();
      setOrders(rows);
    } catch {
      /* keep last list */
    } finally {
      setLoaded(true);
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
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
        ListHeaderComponent={<LargeTitle title={tr("history.title")} />}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Package size={32} color={c.gray3} />
              <Text style={[t.headline, { marginTop: space.md }]}>{tr("history.empty")}</Text>
              <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4, textAlign: "center" }]}>
                {tr("history.empty_sub")}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const when = new Date(item.createdAt);
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={t.body} numberOfLines={1}>
                  {item.orderNumber || item.merchantName || `#${item.id.slice(-6)}`}
                </Text>
                <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 1 }]} numberOfLines={1}>
                  {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={[t.headline, { color: c.tint }]}>{formatKwd(item.amount)}</Text>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor(item.status, c)}22` }]}>
                  <Text style={[t.caption2, { color: statusColor(item.status, c) }]}>{item.status}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xxxl },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base,
    borderWidth: 1, borderColor: c.hairline, marginBottom: space.sm, ...continuous, ...shadow.card,
  },
  statusPill: { borderRadius: radius.capsule, paddingHorizontal: 8, paddingVertical: 3 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: space.xl },
});
