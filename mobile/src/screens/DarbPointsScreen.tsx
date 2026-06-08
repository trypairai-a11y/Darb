import React, { useCallback, useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { DarbPointsResponse } from "../api/client";
import { mockPoints } from "../mockData";
import { Screen, Card, SectionHeader } from "../components/hig";
import { useTheme, type Palette, space, radius, continuous } from "../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX = { attendance: 30, orders: 30, hours: 20, violations: 20 };

export default function DarbPointsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [data, setData] = useState<DarbPointsResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const toneFor = useCallback((score: number | null) => {
    if (score == null) return c.gray;
    if (score >= 80) return c.green;
    if (score >= 60) return c.orange;
    return c.red;
  }, [c]);

  const load = useCallback(() => setData(mockPoints as DarbPointsResponse), []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); setTimeout(() => { load(); setRefreshing(false); }, 400); };

  const score = data?.current?.totalScore ?? null;
  const tone = toneFor(score);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <Text style={[t.largeTitle, { marginTop: space.sm }]}>Darb Points</Text>
        <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2 }]}>
          {data ? `${MONTHS[data.period.month - 1]} ${data.period.year}` : "—"}
        </Text>

        {data?.current ? (
          <>
            <Card style={styles.gauge}>
              <View style={styles.scoreRow}>
                <Text style={[styles.score, { color: tone }]}>{score != null ? Math.round(score) : "—"}</Text>
                <Text style={[t.title3, { color: c.secondaryLabel, marginBottom: 8 }]}> / 100</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, score ?? 0)}%`, backgroundColor: tone }]} />
              </View>
              <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: space.sm }]}>This month's standing</Text>
            </Card>

            <SectionHeader>Breakdown</SectionHeader>
            <Card style={{ gap: space.base }}>
              <Bar label="Attendance" sub={`${data.current.onTimePct.toFixed(0)}% on-time`} value={data.current.attendanceScore} max={MAX.attendance} />
              <Bar label="Orders" sub={`${data.current.ordersCount} orders`} value={data.current.ordersScore} max={MAX.orders} />
              <Bar label="Hours" sub={`${data.current.hoursWorked.toFixed(1)} hrs`} value={data.current.hoursScore} max={MAX.hours} />
              <Bar label="Violations" sub={`${data.current.violationsCount} this month`} value={data.current.violationsScore} max={MAX.violations} />
            </Card>

            {data.trend.length > 0 ? (
              <>
                <SectionHeader>Last 6 months</SectionHeader>
                <Card>
                  <View style={styles.trend}>
                    {data.trend.map((tr) => (
                      <View key={`${tr.year}-${tr.month}`} style={styles.trendCol}>
                        <View style={styles.trendTrack}>
                          <View style={[styles.trendBar, { height: `${Math.max(6, tr.totalScore)}%`, backgroundColor: toneFor(tr.totalScore) }]} />
                        </View>
                        <Text style={[t.caption2, { color: c.secondaryLabel }]}>{MONTHS[tr.month - 1]}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </>
            ) : null}

            <Text style={[t.footnote, { color: c.tertiaryLabel, textAlign: "center", marginTop: space.lg }]}>
              Recomputed daily across Keeta, Talabat, Deliveroo & Americana.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Bar({ label, sub, value, max }: { label: string; sub: string; value: number; max: number }) {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const tone = pct >= 80 ? c.green : pct >= 50 ? c.orange : c.red;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.barHead}>
        <Text style={t.headline}>{label}</Text>
        <Text style={[t.footnote, { color: c.secondaryLabel }]}>{sub}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
      <Text style={[t.caption1, { color: c.tertiaryLabel, textAlign: "right" }]}>{value.toFixed(1)} / {max}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingBottom: space.xxxl },
  gauge: { alignItems: "center", marginTop: space.base, paddingVertical: space.xl },
  scoreRow: { flexDirection: "row", alignItems: "flex-end" },
  score: { fontSize: 72, lineHeight: 76, fontWeight: "700", letterSpacing: -1 },
  track: { height: 8, borderRadius: 4, backgroundColor: c.gray5, overflow: "hidden", width: "100%", ...continuous },
  fill: { height: "100%", borderRadius: 4 },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trend: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, height: 120 },
  trendCol: { flex: 1, alignItems: "center", gap: 6 },
  trendTrack: { width: "70%", height: 96, backgroundColor: c.gray5, borderRadius: radius.sm, overflow: "hidden", justifyContent: "flex-end", ...continuous },
  trendBar: { width: "100%", borderRadius: radius.sm, ...continuous },
});
