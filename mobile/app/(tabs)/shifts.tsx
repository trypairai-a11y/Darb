/**
 * shifts.tsx — the driver's schedule, and how they ask for more of it.
 *
 * Client request, 2026-08-01: "need a tab to book shifts". Booking in the
 * literal sense does not exist yet and could not be faked honestly: every Shift
 * row belongs to a driver already, so there is no pool of open slots to claim.
 * What a driver can do is ask, and Darb creates the shift, which is the same
 * request-then-approve shape the fleet portal uses for everything a delivery
 * company wants.
 *
 * So the tab is two halves. The top is the schedule ops have already given
 * them, which the backend has always returned and nothing ever showed. The
 * bottom is a request, which travels as a SHIFT_REQUEST ticket so it lands in
 * the desk ops already watch rather than a second inbox nobody opens.
 */

import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CalendarPlus, CalendarRange } from "lucide-react-native";
import { fetchMyShifts, requestShift, type ShiftRecord } from "../../src/api/client";
import { Button, Card, LargeTitle, ListGroup, ListRow, Pill, Screen } from "../../src/components/hig";
import { t as tr } from "../../src/i18n/strings";
import { useTheme, type Palette, space, radius, continuous } from "../../src/theme";

/** "2026-08-03" from a date the API may send as a full ISO timestamp. */
function isoDay(value: string): string {
  return String(value ?? "").slice(0, 10);
}

function timeLabel(value: string | null): string {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayLabel(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return isoDay(value);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** BOOKED and IN_PROGRESS are the ones a driver still has to turn up for. */
function statusColor(status: string, c: Palette): string {
  if (status === "COMPLETED") return c.green;
  if (status === "MISSED" || status === "CANCELLED") return c.red;
  if (status === "IN_PROGRESS") return c.tint;
  return c.gray;
}

export default function ShiftsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [area, setArea] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShifts(await fetchMyShifts());
      setStatus("ready");
    } catch {
      // Keep the last-known schedule rather than blanking it: a driver checking
      // when they start next is worse off with an error than with stale rows.
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

  const canSend = date.trim().length > 0 && from.trim().length > 0 && to.trim().length > 0 && !sending;

  const send = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await requestShift({
        date: date.trim(),
        startTime: from.trim(),
        endTime: to.trim(),
        area: area.trim() || undefined,
      });
      setSent(true);
      setDate("");
      setFrom("");
      setTo("");
      setArea("");
    } catch (e: any) {
      setError(e?.message ?? tr("shifts.request_failed"));
    } finally {
      setSending(false);
    }
  }, [canSend, date, from, to, area]);

  const upcoming = shifts.filter((s) => s.status === "BOOKED" || s.status === "IN_PROGRESS");
  const past = shifts.filter((s) => s.status !== "BOOKED" && s.status !== "IN_PROGRESS");

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gray} />}
      >
        <LargeTitle title={tr("shifts.title")} subtitle={tr("shifts.subtitle")} />

        {status === "loading" && shifts.length === 0 ? (
          <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: space.lg }]}>
            {tr("common.loading")}
          </Text>
        ) : null}

        {upcoming.length > 0 ? (
          <ListGroup header={tr("shifts.upcoming")}>
            {upcoming.map((s) => (
              <ListRow
                key={s.id}
                title={dayLabel(s.date)}
                subtitle={`${timeLabel(s.startTime)} - ${timeLabel(s.endTime)}${s.area ? ` · ${s.area}` : ""}`}
                trailing={<Pill label={s.status} color={statusColor(s.status, c)} />}
              />
            ))}
          </ListGroup>
        ) : status === "ready" ? (
          <Card style={{ marginTop: space.lg }}>
            <View style={styles.emptyRow}>
              <CalendarRange size={20} color={c.gray} />
              <Text style={[t.subheadline, { color: c.secondaryLabel, flex: 1 }]}>
                {tr("shifts.none_upcoming")}
              </Text>
            </View>
          </Card>
        ) : null}

        {/* ── Ask for one ── */}
        <Card style={{ marginTop: space.lg }}>
          <View style={styles.headerRow}>
            <CalendarPlus size={18} color={c.tint} />
            <Text style={[t.headline, { flex: 1 }]}>{tr("shifts.request_title")}</Text>
          </View>
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4 }]}>
            {tr("shifts.request_hint")}
          </Text>

          <TextInput
            style={styles.input}
            value={date}
            onChangeText={(v) => { setSent(false); setDate(v); }}
            placeholder={tr("shifts.field_date")}
            placeholderTextColor={c.gray}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={from}
              onChangeText={(v) => { setSent(false); setFrom(v); }}
              placeholder={tr("shifts.field_from")}
              placeholderTextColor={c.gray}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={to}
              onChangeText={(v) => { setSent(false); setTo(v); }}
              placeholder={tr("shifts.field_to")}
              placeholderTextColor={c.gray}
            />
          </View>
          <TextInput
            style={styles.input}
            value={area}
            onChangeText={(v) => { setSent(false); setArea(v); }}
            placeholder={tr("shifts.field_area")}
            placeholderTextColor={c.gray}
          />

          {error ? (
            <Text style={[t.footnote, { color: c.red, marginTop: space.sm }]}>{error}</Text>
          ) : null}
          {sent ? (
            <Text style={[t.footnote, { color: c.green, marginTop: space.sm }]}>
              {tr("shifts.request_sent")}
            </Text>
          ) : null}

          <Button
            title={sending ? tr("common.submit") : tr("shifts.request_button")}
            onPress={() => void send()}
            disabled={!canSend}
            style={{ marginTop: space.base }}
          />
        </Card>

        {past.length > 0 ? (
          <ListGroup header={tr("shifts.past")}>
            {past.slice(0, 15).map((s) => (
              <ListRow
                key={s.id}
                title={dayLabel(s.date)}
                subtitle={`${timeLabel(s.startTime)} - ${timeLabel(s.endTime)}`}
                trailing={<Pill label={s.status} color={statusColor(s.status, c)} />}
              />
            ))}
          </ListGroup>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingBottom: space.xxxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: { flexDirection: "row", gap: space.md },
  input: {
    marginTop: space.md,
    height: 46,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: c.gray4,
    backgroundColor: c.groupedBackground,
    paddingHorizontal: space.base,
    color: c.label,
    ...continuous,
  },
});
