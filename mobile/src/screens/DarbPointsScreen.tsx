import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { DarbPointsResponse } from "../api/client";
import { mockPoints } from "../mockData";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MAX_BY_BUCKET = {
  attendance: 30,
  orders: 30,
  hours: 20,
  violations: 20,
};

export default function DarbPointsScreen({ onBack }: { onBack?: () => void }) {
  const [data, setData] = useState<DarbPointsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(mockPoints as DarbPointsResponse);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const score = data?.current?.totalScore ?? null;
  const tone = score == null ? "#86868b" : score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Darb Points</Text>
        <Text style={styles.subtitle}>
          {data ? `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}` : "—"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#16a34a" style={{ marginTop: 60 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !data ? null : (
          <>
            <View style={styles.gauge}>
              <Text style={[styles.score, { color: tone }]}>
                {score != null ? Math.round(score) : "—"}
              </Text>
              <Text style={styles.scoreUnit}>/ 100</Text>
            </View>

            {data.current && (
              <View style={styles.breakdown}>
                <Bar label="Attendance" sub={`${data.current.onTimePct.toFixed(0)}% on-time`} value={data.current.attendanceScore} max={MAX_BY_BUCKET.attendance} />
                <Bar label="Orders" sub={`${data.current.ordersCount} orders`} value={data.current.ordersScore} max={MAX_BY_BUCKET.orders} />
                <Bar label="Hours" sub={`${data.current.hoursWorked.toFixed(1)} hrs`} value={data.current.hoursScore} max={MAX_BY_BUCKET.hours} />
                <Bar label="Violations" sub={`${data.current.violationsCount} this month`} value={data.current.violationsScore} max={MAX_BY_BUCKET.violations} />
              </View>
            )}

            {data.trend.length > 0 && (
              <View style={styles.trendCard}>
                <Text style={styles.trendTitle}>Last 6 months</Text>
                <View style={styles.trendBars}>
                  {data.trend.map((t) => {
                    const h = Math.max(4, (t.totalScore / 100) * 80);
                    return (
                      <View key={`${t.year}-${t.month}`} style={styles.trendBarCol}>
                        <View style={[styles.trendBar, { height: h }]} />
                        <Text style={styles.trendLabel}>{MONTH_NAMES[t.month - 1]}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <Text style={styles.footnote}>
              Score is recomputed daily across Keeta, Talabat, Deliveroo and Americana.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Bar({ label, sub, value, max }: { label: string; sub: string; value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const tone = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <View style={styles.barRow}>
      <View style={styles.barText}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barSub}>{sub}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
      <Text style={styles.barValue}>
        {value.toFixed(1)} / {max}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f7" },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e5e7" },
  backBtn: { marginBottom: 8 },
  backText: { color: "#86868b", fontSize: 14 },
  title: { fontSize: 24, fontWeight: "700", color: "#1d1d1f" },
  subtitle: { fontSize: 13, color: "#86868b", marginTop: 2 },
  scroll: { padding: 24, paddingBottom: 64 },
  gauge: { alignItems: "center", paddingVertical: 32, backgroundColor: "#fff", borderRadius: 24, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  score: { fontSize: 80, fontWeight: "700", lineHeight: 88 },
  scoreUnit: { fontSize: 16, color: "#86868b", marginTop: 4 },
  breakdown: { marginTop: 16, backgroundColor: "#fff", borderRadius: 24, padding: 20, gap: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  barRow: { gap: 6 },
  barText: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { fontSize: 14, fontWeight: "600", color: "#1d1d1f" },
  barSub: { fontSize: 12, color: "#86868b" },
  barTrack: { height: 8, backgroundColor: "#e5e5e7", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  barValue: { fontSize: 11, color: "#86868b", fontVariant: ["tabular-nums"], textAlign: "right" },
  trendCard: { marginTop: 16, backgroundColor: "#fff", borderRadius: 24, padding: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  trendTitle: { fontSize: 14, fontWeight: "600", color: "#1d1d1f", marginBottom: 12 },
  trendBars: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 100 },
  trendBarCol: { flex: 1, alignItems: "center", gap: 4 },
  trendBar: { width: "100%", backgroundColor: "#16a34a", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  trendLabel: { fontSize: 10, color: "#86868b" },
  footnote: { marginTop: 24, fontSize: 11, color: "#86868b", textAlign: "center" },
  errorText: { color: "#dc2626", textAlign: "center", marginTop: 60 },
});
