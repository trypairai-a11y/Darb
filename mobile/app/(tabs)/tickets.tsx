import { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Plus, Inbox } from "lucide-react-native";
import { TicketRecord } from "../../src/api/client";
import { Screen, ListGroup, ListRow, Pill } from "../../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";
import { mockTickets } from "../../src/mockData";

const CATEGORY_LABEL: Record<string, string> = {
  VEHICLE_REPAIR: "Vehicle repair", EQUIPMENT_REQUEST: "Equipment", LEAVE_REQUEST: "Leave",
  SALARY_ISSUE: "Salary", TRANSFER_REQUEST: "Transfer", COMPLAINT: "Complaint",
  ACCIDENT_REPORT: "Accident", OTHER: "Other",
};

export default function TicketsScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const STATUS_META: Record<string, { fill: string; fg: string; label: string }> = {
    OPEN: { fill: c.orangeFill, fg: c.orange, label: "Open" },
    ASSIGNED: { fill: c.tintFill, fg: c.blue, label: "Assigned" },
    IN_PROGRESS: { fill: c.tintFill, fg: c.indigo, label: "In progress" },
    RESOLVED: { fill: c.greenFill, fg: c.green, label: "Resolved" },
    CLOSED: { fill: c.tertiaryFill, fg: c.secondaryLabel, label: "Closed" },
  };

  const load = useCallback(() => setTickets(mockTickets as TicketRecord[]), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => { load(); setRefreshing(false); }, 400);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <View style={styles.header}>
          <Text style={t.largeTitle}>Tickets</Text>
          <TouchableOpacity style={styles.newBtn} activeOpacity={0.85} onPress={() => router.push("/submit-ticket")}>
            <Plus size={18} color={c.white} />
            <Text style={[t.subheadline, { color: c.white, fontWeight: "600" }]}>New</Text>
          </TouchableOpacity>
        </View>

        {tickets.length === 0 ? (
          <View style={styles.empty}>
            <Inbox size={40} color={c.gray3} />
            <Text style={[t.headline, { marginTop: space.md }]}>No tickets yet</Text>
            <Text style={[t.subheadline, { color: c.secondaryLabel }]}>Tap “New” to file a ticket.</Text>
          </View>
        ) : (
          <ListGroup style={{ marginTop: space.sm }}>
            {tickets.map((tk) => {
              const st = STATUS_META[tk.status] ?? STATUS_META.OPEN;
              return (
                <ListRow
                  key={tk.id}
                  title={tk.title}
                  subtitle={`${CATEGORY_LABEL[tk.category] ?? tk.category} · ${tk.ticketNumber}`}
                  onPress={() => router.push({ pathname: "/ticket-detail", params: { id: tk.id } })}
                  trailing={<Pill label={st.label} color={st.fg} fill={st.fill} />}
                  chevron
                />
              );
            })}
          </ListGroup>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xxxl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.tint,
    paddingHorizontal: space.base, height: 36, borderRadius: radius.capsule, ...continuous, ...shadow.card,
  },
  empty: { alignItems: "center", gap: 4, paddingTop: 100 },
});
