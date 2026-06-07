import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  Image, TouchableOpacity, SafeAreaView, Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { BASE_URL, TicketRecord } from "../src/api/client";
import { getMockTicket } from "../src/mockData";

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  OPEN: { bg: "#FEF3C7", fg: "#92400E", label: "Open" },
  ASSIGNED: { bg: "#DBEAFE", fg: "#1E40AF", label: "Assigned" },
  IN_PROGRESS: { bg: "#E0E7FF", fg: "#3730A3", label: "In progress" },
  RESOLVED: { bg: "#D1FAE5", fg: "#065F46", label: "Resolved" },
  CLOSED: { bg: "#E5E7EB", fg: "#374151", label: "Closed" },
};

const PHOTO_SIZE = Math.min(Dimensions.get("window").width - 64, 280);

export default function TicketDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setTicket(getMockTicket(id) as TicketRecord);
      } catch (e: any) {
        setError(e.message ?? "Failed to load ticket");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const status = ticket ? STATUS_COLORS[ticket.status] ?? STATUS_COLORS.OPEN : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft size={22} color="#111827" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#F97316" /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.error}>{error}</Text></View>
      ) : ticket && status ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
          <View style={[styles.pill, { backgroundColor: status.bg, alignSelf: "flex-start" }]}>
            <Text style={[styles.pillText, { color: status.fg }]}>{status.label}</Text>
          </View>
          <Text style={styles.title}>{ticket.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Category</Text>
            <Text style={styles.metaValue}>{ticket.category.replace(/_/g, " ")}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Submitted</Text>
            <Text style={styles.metaValue}>{new Date(ticket.createdAt).toLocaleString()}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Priority</Text>
            <Text style={styles.metaValue}>{ticket.priority}</Text>
          </View>

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{ticket.description}</Text>

          {ticket.photos && ticket.photos.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
                {ticket.photos.map((path, idx) => (
                  <Image
                    key={idx}
                    source={{ uri: `${BASE_URL}${path}` }}
                    style={styles.photo}
                  />
                ))}
              </ScrollView>
            </>
          )}

          {ticket.status === "RESOLVED" && (
            <View style={styles.resolutionCard}>
              <Text style={styles.resolutionLabel}>Resolution</Text>
              <Text style={styles.resolutionText}>{ticket.resolution || "—"}</Text>
              {ticket.resolvedAt && (
                <Text style={styles.resolutionDate}>
                  Resolved {new Date(ticket.resolvedAt).toLocaleString()}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#fff", borderBottomColor: "#E5E7EB", borderBottomWidth: 1,
  },
  back: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, color: "#111827", marginLeft: 4 },
  body: { padding: 20, gap: 8 },
  ticketNumber: { fontSize: 12, fontWeight: "600", color: "#6B7280", letterSpacing: 0.5 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 4 },
  pillText: { fontSize: 11, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 8, marginBottom: 12 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  metaLabel: { fontSize: 13, color: "#6B7280" },
  metaValue: { fontSize: 13, color: "#111827", fontWeight: "500" },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: "#6B7280", letterSpacing: 0.5, marginTop: 16, textTransform: "uppercase" },
  description: { fontSize: 15, color: "#111827", lineHeight: 22, marginTop: 4 },
  photosRow: { gap: 8, paddingTop: 8 },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 12, backgroundColor: "#E5E7EB" },
  resolutionCard: {
    marginTop: 24, padding: 16, borderRadius: 12,
    backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1,
  },
  resolutionLabel: { fontSize: 12, fontWeight: "700", color: "#065F46", letterSpacing: 0.5, textTransform: "uppercase" },
  resolutionText: { fontSize: 15, color: "#064E3B", marginTop: 6, lineHeight: 22 },
  resolutionDate: { fontSize: 12, color: "#047857", marginTop: 8 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { color: "#B91C1C", fontSize: 14, paddingHorizontal: 24, textAlign: "center" },
});
