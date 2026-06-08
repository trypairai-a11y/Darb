import { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Image } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BASE_URL, TicketRecord } from "../src/api/client";
import { getMockTicket } from "../src/mockData";
import { NavBar, Card, ListGroup, ListRow, Pill, Screen } from "../src/components/hig";
import { useTheme, type Palette, space, radius, continuous } from "../src/theme";

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [ticket, setTicket] = useState<TicketRecord | null>(null);

  useEffect(() => { if (id) setTicket(getMockTicket(id) as TicketRecord); }, [id]);

  const STATUS_META: Record<string, { fill: string; fg: string; label: string }> = {
    OPEN: { fill: c.orangeFill, fg: c.orange, label: "Open" },
    ASSIGNED: { fill: c.tintFill, fg: c.blue, label: "Assigned" },
    IN_PROGRESS: { fill: c.tintFill, fg: c.indigo, label: "In progress" },
    RESOLVED: { fill: c.greenFill, fg: c.green, label: "Resolved" },
    CLOSED: { fill: c.tertiaryFill, fg: c.secondaryLabel, label: "Closed" },
  };
  const st = ticket ? STATUS_META[ticket.status] ?? STATUS_META.OPEN : null;

  return (
    <Screen>
      <NavBar title="Ticket" />
      {ticket && st ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "flex-start" }}>
            <Text style={[t.footnote, { color: c.secondaryLabel }]}>{ticket.ticketNumber}</Text>
            <Text style={[t.title2, { marginTop: 4, marginBottom: space.sm }]}>{ticket.title}</Text>
            <Pill label={st.label} color={st.fg} fill={st.fill} />
          </View>

          <ListGroup header="Details" style={{ marginTop: space.base }}>
            <ListRow title="Category" detail={ticket.category.replace(/_/g, " ")} />
            <ListRow title="Priority" detail={ticket.priority} />
            <ListRow title="Submitted" detail={new Date(ticket.createdAt).toLocaleDateString()} />
          </ListGroup>

          <Text style={[t.footnote, styles.sectionLabel]}>DESCRIPTION</Text>
          <Card><Text style={t.body}>{ticket.description}</Text></Card>

          {ticket.photos && ticket.photos.length > 0 ? (
            <>
              <Text style={[t.footnote, styles.sectionLabel]}>PHOTOS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {ticket.photos.map((p, i) => <Image key={i} source={{ uri: `${BASE_URL}${p}` }} style={styles.photo} />)}
              </ScrollView>
            </>
          ) : null}

          {ticket.status === "RESOLVED" ? (
            <Card style={styles.resolution}>
              <Text style={[t.footnote, { color: c.successLabel2, fontWeight: "700", letterSpacing: 0.4 }]}>RESOLUTION</Text>
              <Text style={[t.body, { color: c.successLabel, marginTop: 6 }]}>{ticket.resolution || "—"}</Text>
              {ticket.resolvedAt ? (
                <Text style={[t.footnote, { color: c.successLabel2, marginTop: space.sm }]}>
                  Resolved {new Date(ticket.resolvedAt).toLocaleString()}
                </Text>
              ) : null}
            </Card>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.xxxl },
  sectionLabel: { color: c.secondaryLabel, marginLeft: space.base, marginTop: space.lg, marginBottom: 7 },
  photo: { width: 220, height: 220, borderRadius: radius.card, backgroundColor: c.gray5, ...continuous },
  resolution: { marginTop: space.lg, backgroundColor: c.successBg },
});
