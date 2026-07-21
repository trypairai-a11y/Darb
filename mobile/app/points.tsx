/**
 * points.tsx — "My Darb Points" screen.
 *
 * Renders the driver's monthly composite score from GET /api/agent/points:
 * big overall number, sub-score rows (attendance / orders / hours /
 * violations), this month's raw stats, and the recent-months trend.
 * Entry points: Settings → My Darb Points, and the Home points row.
 */

import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Award, CalendarCheck, Clock, Package, TriangleAlert } from "lucide-react-native";
import { fetchMyDarbPoints, type DarbPointsResponse } from "../src/api/client";
import { Button, ListGroup, ListRow, NavBar, Screen } from "../src/components/hig";
import { t as tr } from "../src/i18n/strings";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../src/theme";

/** Scores may arrive as floats — show at most 1 decimal place. */
function formatScore(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return String(Math.round(n * 10) / 10);
}

export default function PointsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [data, setData] = useState<DarbPointsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchMyDarbPoints();
      setData(res);
      setStatus("ready");
    } catch {
      // Keep showing last-known data if we already have it.
      setStatus((s) => (s === "ready" ? s : "error"));
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

  const current = data?.current ?? null;
  const trend = data?.trend ?? [];

  return (
    <Screen>
      <NavBar title={tr("points.title")} />

      {status === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: space.md }]}>
            {tr("common.loading")}
          </Text>
        </View>
      ) : status === "error" ? (
        <View style={styles.center}>
          <TriangleAlert size={32} color={c.gray3} />
          <Text style={[t.headline, { marginTop: space.md }]}>{tr("points.error")}</Text>
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4, textAlign: "center" }]}>
            {tr("points.error_sub")}
          </Text>
          <Button
            title={tr("common.retry")}
            variant="tinted"
            style={{ marginTop: space.xl, alignSelf: "stretch" }}
            onPress={() => {
              setStatus("loading");
              void load();
            }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
        >
          {/* ─── Overall score ─── */}
          {current ? (
            <View style={styles.hero}>
              <Award size={22} color={c.tint} />
              <Text style={[t.hero, { color: c.tint, marginTop: space.sm }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatScore(current.totalScore)}
              </Text>
              <Text style={[t.caption1, { color: c.secondaryLabel, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }]}>
                {tr("points.overall")}
              </Text>
              <Text style={[t.footnote, { color: c.tertiaryLabel, marginTop: 2 }]}>
                {data ? `${data.period.month}/${data.period.year}` : ""}
              </Text>
            </View>
          ) : (
            <View style={styles.hero}>
              <Award size={32} color={c.gray3} />
              <Text style={[t.headline, { marginTop: space.md }]}>{tr("points.empty")}</Text>
              <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4, textAlign: "center" }]}>
                {tr("points.empty_sub")}
              </Text>
            </View>
          )}

          {/* ─── Sub-scores ─── */}
          {current ? (
            <ListGroup header={tr("points.breakdown")}>
              <ListRow
                icon={<CalendarCheck size={16} color={c.tint} />}
                title={tr("points.attendance")}
                detail={formatScore(current.attendanceScore)}
              />
              <ListRow
                icon={<Package size={16} color={c.tint} />}
                title={tr("points.orders")}
                detail={formatScore(current.ordersScore)}
              />
              <ListRow
                icon={<Clock size={16} color={c.tint} />}
                title={tr("points.hours")}
                detail={formatScore(current.hoursScore)}
              />
              <ListRow
                icon={<TriangleAlert size={16} color={current.violationsCount > 0 ? c.orange : c.tint} />}
                title={tr("points.violations")}
                detail={formatScore(current.violationsScore)}
              />
            </ListGroup>
          ) : null}

          {/* ─── Raw stats for the month ─── */}
          {current ? (
            <ListGroup header={tr("points.stats")}>
              <ListRow title={tr("points.stat_on_time")} detail={`${Math.round(current.onTimePct)}%`} />
              <ListRow title={tr("points.stat_orders")} detail={String(current.ordersCount)} />
              <ListRow title={tr("points.stat_hours")} detail={formatScore(current.hoursWorked)} />
              <ListRow title={tr("points.stat_violations")} detail={String(current.violationsCount)} />
            </ListGroup>
          ) : null}

          {/* ─── Trend ─── */}
          {trend.length > 0 ? (
            <ListGroup header={tr("points.trend")}>
              {trend.map((row) => (
                <ListRow
                  key={`${row.year}-${row.month}`}
                  title={`${row.month}/${row.year}`}
                  detail={formatScore(row.totalScore)}
                />
              ))}
            </ListGroup>
          ) : null}

          {current?.computedAt ? (
            <Text style={[t.footnote, { color: c.tertiaryLabel, textAlign: "center", marginTop: space.xl }]}>
              {tr("points.updated", { date: new Date(current.computedAt).toLocaleDateString() })}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  hero: {
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.lg,
    borderWidth: 1, borderColor: "rgba(198,255,58,0.25)", alignItems: "center", ...continuous, ...shadow.card,
  },
});
