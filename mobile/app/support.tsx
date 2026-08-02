/**
 * support.tsx — rider support.
 *
 * Client request, 2026-08-01: "I need a button for rider support". The desk
 * behind this already existed and had for a long time. /api/agent/tickets took
 * submissions, listed them and returned one by id, and the client functions for
 * all three were sitting in src/api/client.ts with nothing calling them. There
 * was simply no screen, so from a driver's phone the whole thing may as well
 * not have been built.
 *
 * This is not SOS. SOS is the red emergency path on Home for a driver in
 * trouble right now, and it must stay one press away and unmistakable. This is
 * the ordinary channel: a bike that needs repair, a wrong deduction, a question
 * about pay. Keeping them apart matters in both directions, an emergency must
 * never queue behind a salary question, and a salary question must never page
 * the on-call supervisor.
 */

import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { LifeBuoy } from "lucide-react-native";
import {
  createSupportTicket,
  listMyTickets,
  type TicketRecord,
} from "../src/api/client";
import { Button, Card, ListGroup, ListRow, NavBar, Pill, Screen, Segmented } from "../src/components/hig";
import { t as tr } from "../src/i18n/strings";
import { useTheme, type Palette, space, radius, continuous } from "../src/theme";

/**
 * The four kinds a driver raises (client rule, 2026-08-02).
 *
 * It was five, split the way the back office files things: Bike, Kit, Pay,
 * Complaint, Other. A driver does not think in those, and a wrong pick is a
 * ticket that lands on the wrong desk. Vehicle, Order, Driver, Other is the
 * split they actually use.
 *
 * Still a subset of what the server accepts: ACCIDENT_REPORT is missing because
 * an accident is an SOS, not a support ticket, and SHIFT_REQUEST has its own
 * screen with the fields it needs.
 */
const CATEGORIES = ["VEHICLE_REPAIR", "ORDER_ISSUE", "DRIVER_ISSUE", "OTHER"] as const;
type Category = (typeof CATEGORIES)[number];

function statusColor(status: string, c: Palette): string {
  if (status === "RESOLVED" || status === "CLOSED") return c.green;
  if (status === "IN_PROGRESS") return c.tint;
  return c.gray;
}

export default function SupportScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [category, setCategory] = useState<Category>("VEHICLE_REPAIR");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTickets(await listMyTickets());
    } catch {
      // A driver who cannot reach the list can still file one, so a failure
      // here must not take the form down with it.
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

  const canSend = title.trim().length > 2 && description.trim().length > 2 && !sending;

  const send = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await createSupportTicket({
        category,
        title: title.trim(),
        description: description.trim(),
      });
      setSent(true);
      setTitle("");
      setDescription("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? tr("support.failed"));
    } finally {
      setSending(false);
    }
  }, [canSend, category, title, description, load]);

  return (
    <Screen>
      <NavBar title={tr("support.title")} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gray} />}
      >
        <Card>
          <View style={styles.headerRow}>
            <LifeBuoy size={18} color={c.tint} />
            <Text style={[t.headline, { flex: 1 }]}>{tr("support.new_title")}</Text>
          </View>
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4 }]}>
            {tr("support.new_hint")}
          </Text>

          <View style={{ marginTop: space.base }}>
            <Segmented<Category>
              options={CATEGORIES.map((v) => ({ value: v, label: tr(`support.cat_${v}`) }))}
              value={category}
              onChange={(v) => { setSent(false); setCategory(v); }}
            />
          </View>

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={(v) => { setSent(false); setTitle(v); }}
            placeholder={tr("support.field_title")}
            placeholderTextColor={c.gray}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={(v) => { setSent(false); setDescription(v); }}
            placeholder={tr("support.field_description")}
            placeholderTextColor={c.gray}
            multiline
          />

          {error ? (
            <Text style={[t.footnote, { color: c.red, marginTop: space.sm }]}>{error}</Text>
          ) : null}
          {sent ? (
            <Text style={[t.footnote, { color: c.green, marginTop: space.sm }]}>
              {tr("support.sent")}
            </Text>
          ) : null}

          <Button
            title={sending ? tr("common.submit") : tr("support.send")}
            onPress={() => void send()}
            disabled={!canSend}
            style={{ marginTop: space.base }}
          />
        </Card>

        {tickets.length > 0 ? (
          <ListGroup header={tr("support.mine")}>
            {tickets.slice(0, 20).map((tk) => (
              <ListRow
                key={tk.id}
                title={tk.title}
                subtitle={`${tk.ticketNumber} · ${tr(`support.cat_${tk.category}`)}`}
                trailing={<Pill label={tk.status} color={statusColor(tk.status, c)} />}
              />
            ))}
          </ListGroup>
        ) : (
          <Text style={[t.footnote, { color: c.secondaryLabel, textAlign: "center", marginTop: space.lg }]}>
            {tr("support.none")}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingBottom: space.xxxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  input: {
    marginTop: space.md,
    minHeight: 46,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: c.gray4,
    backgroundColor: c.groupedBackground,
    paddingHorizontal: space.base,
    paddingTop: 13,
    paddingBottom: 13,
    color: c.label,
    ...continuous,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
});
