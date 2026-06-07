import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, SafeAreaView, ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Plus, Inbox } from "lucide-react-native";
import { TicketRecord } from "../../src/api/client";
import { mockTickets } from "../../src/mockData";

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  OPEN: { bg: "#FEF3C7", fg: "#92400E", label: "Open" },
  ASSIGNED: { bg: "#DBEAFE", fg: "#1E40AF", label: "Assigned" },
  IN_PROGRESS: { bg: "#E0E7FF", fg: "#3730A3", label: "In progress" },
  RESOLVED: { bg: "#D1FAE5", fg: "#065F46", label: "Resolved" },
  CLOSED: { bg: "#E5E7EB", fg: "#374151", label: "Closed" },
};

const CATEGORY_LABEL: Record<string, string> = {
  VEHICLE_REPAIR: "Vehicle repair",
  EQUIPMENT_REQUEST: "Equipment",
  LEAVE_REQUEST: "Leave",
  SALARY_ISSUE: "Salary",
  TRANSFER_REQUEST: "Transfer",
  COMPLAINT: "Complaint",
  ACCIDENT_REPORT: "Accident",
  OTHER: "Other",
};

export default function TicketsListScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setError(null);
      setTickets(mockTickets as TicketRecord[]);
    } catch (e: any) {
      setError(e.message ?? "Failed to load tickets");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTickets();
    }, [fetchTickets])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tickets</Text>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => router.push("/submit-ticket")}
        >
          <Plus size={18} color="#fff" />
          <Text style={styles.newButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#F97316" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={tickets.length === 0 ? styles.emptyContent : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F97316" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Inbox size={36} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No tickets yet</Text>
              <Text style={styles.emptyBody}>Tap "New" to file a ticket.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = STATUS_COLORS[item.status] ?? STATUS_COLORS.OPEN;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push({ pathname: "/ticket-detail", params: { id: item.id } })}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.ticketNumber}>{item.ticketNumber}</Text>
                  <View style={[styles.pill, { backgroundColor: status.bg }]}>
                    <Text style={[styles.pillText, { color: status.fg }]}>{status.label}</Text>
                  </View>
                </View>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.rowFooter}>
                  <Text style={styles.metaText}>
                    {CATEGORY_LABEL[item.category] ?? item.category}
                  </Text>
                  <Text style={styles.metaText}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    backgroundColor: "#fff", borderBottomColor: "#E5E7EB", borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  newButton: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#F97316", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  newButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  listContent: { padding: 16, gap: 12 },
  emptyContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  empty: { alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginTop: 8 },
  emptyBody: { fontSize: 14, color: "#6B7280" },
  row: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    borderColor: "#E5E7EB", borderWidth: 1, marginBottom: 12, gap: 6,
  },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketNumber: { fontSize: 12, fontWeight: "600", color: "#6B7280", letterSpacing: 0.5 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: "600" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  metaText: { fontSize: 12, color: "#6B7280" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { color: "#B91C1C", fontSize: 14, paddingHorizontal: 24, textAlign: "center" },
});
