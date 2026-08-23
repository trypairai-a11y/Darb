/**
 * shifts.tsx — the driver's schedule, and how they book more of it.
 *
 * Client request, 2026-08-03: "I need same as Talabat app design". The screen
 * that shipped on 2026-08-01 was a form: type a date, type a start time, press
 * Send. It worked, and the client's verdict was "the driver is still the same
 * nothing changed", which was fair. Two things were wrong with it.
 *
 * The first is the shape. Booking a shift is picking one of a handful of
 * windows on a day, not composing a timestamp. So the day strip and the window
 * cards below are the whole interaction, and a booking is one tap.
 *
 * The second is what happened after the tap, and it is the reason the client
 * saw nothing change. The ask used to travel as a support ticket and nothing
 * else: the driver got one line of green text a reload wiped, "Coming up" still
 * read "No shifts booked yet", and no surface at Darb could turn that ticket
 * into a shift, so it was never going to appear. The tap now writes a
 * ShiftRequest, My shifts lists it immediately as Awaiting Darb, and approving
 * it at Darb is what creates the Shift and flips the row to Confirmed.
 *
 * Still request-then-approve rather than Talabat's instant claim, because Darb
 * has no pool of published slots to claim from: every Shift row belongs to a
 * driver already. What changed is that the ask is visible from the moment it is
 * made.
 */

import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CalendarRange, Check, Clock, MapPin } from "lucide-react-native";
import {
  cancelShiftRequest,
  fetchMyShiftRequests,
  fetchMyShifts,
  fetchShiftSlots,
  requestShift,
  type ShiftRecord,
  type ShiftRequestRecord,
  type ShiftSlot,
} from "../../src/api/client";
import { Button, Card, LargeTitle, ListGroup, ListRow, Pill, Screen } from "../../src/components/hig";
import { t as tr } from "../../src/i18n/strings";
import { useTheme, type Palette, space, radius, continuous } from "../../src/theme";

/**
 * How many days forward the strip offers. The server refuses beyond a week.
 * Client request, revision 16 (#5): shifts open one week at a time.
 */
const DAYS_AHEAD = 7;

/** "2026-08-03" from a Date, in the local day the driver is standing in. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-08-03" from a date the API may send as a full ISO timestamp. */
function isoDayOf(value: string): string {
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
  if (Number.isNaN(d.getTime())) return isoDayOf(value);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** BOOKED and IN_PROGRESS are the ones a driver still has to turn up for. */
function statusColor(status: string, c: Palette): string {
  if (status === "COMPLETED") return c.green;
  if (status === "MISSED" || status === "CANCELLED") return c.red;
  if (status === "IN_PROGRESS") return c.tint;
  return c.gray;
}

/** One row in My shifts, whichever half of the schedule it came from. */
interface MineRow {
  key: string;
  day: string;
  window: string;
  area: string | null;
  label: string;
  color: string;
  /** Set only while Darb has not decided, which is the only withdrawable state. */
  pendingRequestId?: string;
  note?: string | null;
  sortAt: string;
}

export default function ShiftsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [requests, setRequests] = useState<ShiftRequestRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [refreshing, setRefreshing] = useState(false);

  // The zone is Darb's answer, not the driver's question (client request,
  // 2026-08-06). It arrives with the windows because both depend on which area
  // this driver was rostered into, and a screen that knew one without the other
  // could only draw half of itself.
  const [zone, setZone] = useState<{ id: string; name: string } | null>(null);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [slotsStatus, setSlotsStatus] = useState<"loading" | "error" | "ready">("loading");

  const today = useMemo(() => new Date(), []);
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [busyWindow, setBusyWindow] = useState<string | null>(null);
  const [busyCancel, setBusyCancel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const days = useMemo(() => {
    const out: { iso: string; weekday: string; num: string }[] = [];
    for (let i = 0; i < DAYS_AHEAD; i += 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      out.push({
        iso: isoDay(d),
        weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
        num: String(d.getDate()),
      });
    }
    return out;
  }, [today]);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([fetchMyShifts(), fetchMyShiftRequests()]);
      setShifts(s);
      setRequests(r);
      setStatus("ready");
    } catch {
      // Keep the last-known schedule rather than blanking it: a driver checking
      // when they start next is worse off with an error than with stale rows.
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  /**
   * The windows for one day. Re-read per day rather than once for the fortnight
   * because how full a window is changes while the driver is looking at it, and
   * a stale "2 places left" is the one number on this screen worth being right.
   */
  const loadSlots = useCallback(async (iso: string) => {
    setSlotsStatus("loading");
    try {
      const res = await fetchShiftSlots(iso);
      setZone(res.zone ? { id: res.zone.id, name: res.zone.name } : null);
      setSlots(res.windows);
      setSlotsStatus("ready");
    } catch {
      setSlotsStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadSlots(day);
    }, [load, loadSlots, day]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([load(), loadSlots(day)]).finally(() => setRefreshing(false));
  }, [load, loadSlots, day]);

  /**
   * Which windows on the open day the driver already holds, in either form.
   *
   * A window they have asked for and a window Darb has confirmed both have to
   * read as taken: offering Book on something already booked is how a driver
   * ends up with two rows for one afternoon and a 409 they cannot act on.
   */
  const takenOnDay = useMemo(() => {
    const taken = new Set<string>();
    for (const r of requests) {
      if (r.status !== "PENDING" && r.status !== "APPROVED") continue;
      if (isoDayOf(r.date) === day) taken.add(r.startTime);
    }
    for (const s of shifts) {
      if (s.status === "CANCELLED") continue;
      if (isoDayOf(s.date) === day) taken.add(timeLabel(s.startTime));
    }
    return taken;
  }, [requests, shifts, day]);

  /**
   * "He will see the available times only" — the client's phrasing, and a
   * window that started an hour ago is not one. The server stamps `past` off
   * its own clock rather than the phone's, which is what stops a driver with a
   * wrong device time from seeing a window Darb has already closed.
   */
  const bookable = useMemo(() => slots.filter((s) => !s.past), [slots]);

  const book = useCallback(
    async (start: string) => {
      if (!zone || busyWindow) return;
      setBusyWindow(start);
      setError(null);
      setSent(false);
      try {
        // No zoneId: the server reads it off the driver's own row now, so
        // sending one here would be sending something it ignores.
        await requestShift({ date: day, startTime: start });
        setSent(true);
        // Re-read rather than pushing the new row in by hand: the list has to
        // match what Darb holds, and this is the moment the driver looks. The
        // windows are re-read with it because that booking just took a place
        // off the one below it.
        const [reqs] = await Promise.all([fetchMyShiftRequests(), loadSlots(day)]);
        setRequests(reqs);
      } catch (e: any) {
        setError(e?.message ?? tr("shifts.request_failed"));
        // A 409 means somebody else took the last place or Darb closed the
        // window, so the list on screen is already wrong.
        void loadSlots(day);
      } finally {
        setBusyWindow(null);
      }
    },
    [zone, busyWindow, day, loadSlots],
  );

  const withdraw = useCallback(async (id: string) => {
    setBusyCancel(id);
    setError(null);
    try {
      await cancelShiftRequest(id);
      // Dropping now cancels the Shift behind the booking too, so refreshing
      // only the requests would leave the confirmed row still on screen.
      const [s, r] = await Promise.all([fetchMyShifts(), fetchMyShiftRequests()]);
      setShifts(s);
      setRequests(r);
    } catch (e: any) {
      setError(e?.message ?? tr("shifts.withdraw_failed"));
    } finally {
      setBusyCancel(null);
    }
  }, []);

  /**
   * My shifts: the confirmed schedule and the outstanding asks in one list.
   *
   * Two lists would put the answer to "did my booking go through" in whichever
   * one the driver did not scroll to. A request Darb approved is dropped here
   * because the Shift it created is already in the list.
   */
  const mine = useMemo<MineRow[]>(() => {
    const rows: MineRow[] = [];
    // Booking confirms on the tap since revision 16 (#4), so a shift the driver
    // made themselves arrives here APPROVED rather than PENDING. The request id
    // is carried onto the shift row so Drop still works: without it the only
    // way out of a shift would be to phone somebody.
    const requestBySlot = new Map<string, string>();
    for (const r of requests) {
      if (r.status !== "APPROVED") continue;
      requestBySlot.set(`${isoDayOf(r.date)}T${r.startTime}`, r.id);
    }
    for (const s of shifts) {
      if (s.status !== "BOOKED" && s.status !== "IN_PROGRESS") continue;
      rows.push({
        key: `shift:${s.id}`,
        day: isoDayOf(s.date),
        window: `${timeLabel(s.startTime)} - ${timeLabel(s.endTime)}`,
        area: s.area,
        label: s.status === "IN_PROGRESS" ? s.status : tr("shifts.status_confirmed"),
        color: statusColor(s.status, c),
        // Only a shift that has not started can be dropped.
        pendingRequestId:
          s.status === "BOOKED"
            ? requestBySlot.get(`${isoDayOf(s.date)}T${timeLabel(s.startTime)}`)
            : undefined,
        sortAt: `${isoDayOf(s.date)}T${timeLabel(s.startTime)}`,
      });
    }
    for (const r of requests) {
      if (r.status === "APPROVED") continue;
      if (r.status === "CANCELLED") continue;
      rows.push({
        key: `req:${r.id}`,
        day: isoDayOf(r.date),
        window: `${r.startTime} - ${r.endTime}`,
        area: r.area,
        label: r.status === "DECLINED" ? tr("shifts.status_declined") : tr("shifts.status_pending"),
        color: r.status === "DECLINED" ? c.red : c.orange,
        pendingRequestId: r.status === "PENDING" ? r.id : undefined,
        note: r.status === "DECLINED" ? r.declineReason : null,
        sortAt: `${isoDayOf(r.date)}T${r.startTime}`,
      });
    }
    return rows.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
  }, [shifts, requests, c]);

  const past = shifts.filter((s) => s.status !== "BOOKED" && s.status !== "IN_PROGRESS");

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gray} />}
      >
        <LargeTitle title={tr("shifts.title")} subtitle={tr("shifts.subtitle")} />

        {/* ── Book one ── */}
        <Card style={{ marginTop: space.lg }}>
          <View style={styles.headerRow}>
            <Clock size={18} color={c.tint} />
            <Text style={[t.headline, { flex: 1 }]}>{tr("shifts.request_title")}</Text>
          </View>
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4 }]}>
            {tr("shifts.request_hint")}
          </Text>

          {/* The day strip. Horizontal because two weeks of days down the page
              would push the windows off the bottom of every phone. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayStrip}
          >
            {days.map((d, i) => {
              const on = d.iso === day;
              return (
                <TouchableOpacity
                  key={d.iso}
                  onPress={() => { setSent(false); setError(null); setDay(d.iso); }}
                  activeOpacity={0.8}
                  style={[styles.dayCell, on && { backgroundColor: c.tint, borderColor: c.tint }]}
                >
                  <Text style={[t.caption2, { color: on ? c.onTint : c.secondaryLabel }]}>
                    {i === 0 ? tr("shifts.today") : i === 1 ? tr("shifts.tomorrow") : d.weekday}
                  </Text>
                  <Text style={[t.headline, { color: on ? c.onTint : c.label }]}>{d.num}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/*
            The area, stated rather than chosen. The chips that used to sit here
            let a driver book Salmiya on Monday and Jahra on Tuesday, which is
            the opposite of how Darb plans the roster, so the assignment moved
            to the HQ portal and this line is what is left of it.
          */}
          {zone ? (
            <View style={styles.zoneLine}>
              <MapPin size={14} color={c.tint} />
              <Text style={[t.footnote, { color: c.secondaryLabel, flex: 1 }]}>
                {tr("shifts.your_area", { area: zone.name })}
              </Text>
            </View>
          ) : null}

          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: space.md }]}>
            {tr("shifts.windows")}
          </Text>
          {!zone ? (
            // Not an error state and not an empty one: a driver with no area is
            // waiting on their supervisor, and saying so beats five buttons
            // that would every one of them answer 409.
            <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: space.sm }]}>
              {slotsStatus === "loading" ? tr("common.loading") : tr("shifts.no_area")}
            </Text>
          ) : bookable.length === 0 ? (
            <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: space.sm }]}>
              {slotsStatus === "loading" ? tr("common.loading") : tr("shifts.no_windows")}
            </Text>
          ) : (
            <View style={{ marginTop: space.sm }}>
              {bookable.map((slot) => {
                // The server counts what is held, but a booking made two
                // seconds ago is on this screen before the count catches up.
                const taken = slot.mine || takenOnDay.has(slot.start);
                return (
                  <View key={slot.start} style={styles.slotRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.subheadline, { color: slot.full && !taken ? c.gray : c.label }]}>
                        {slot.start} - {slot.end}
                      </Text>
                      <Text style={[t.caption2, { color: c.secondaryLabel }]}>
                        {slot.remaining === null
                          ? zone.name
                          : slot.remaining > 0
                            ? tr("shifts.places_left", { count: slot.remaining })
                            : tr("shifts.full")}
                      </Text>
                    </View>
                    {taken ? (
                      <View style={styles.takenPill}>
                        <Check size={12} color={c.green} />
                        <Text style={[t.caption2, { color: c.green }]}>{tr("shifts.taken")}</Text>
                      </View>
                    ) : slot.full ? (
                      <View style={styles.takenPill}>
                        <Text style={[t.caption2, { color: c.secondaryLabel }]}>{tr("shifts.full")}</Text>
                      </View>
                    ) : (
                      <Button
                        title={busyWindow === slot.start ? tr("shifts.booking") : tr("shifts.book")}
                        onPress={() => void book(slot.start)}
                        disabled={!!busyWindow}
                        style={styles.bookButton}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {error ? (
            <Text style={[t.footnote, { color: c.red, marginTop: space.sm }]}>{error}</Text>
          ) : null}
          {sent ? (
            <Text style={[t.footnote, { color: c.green, marginTop: space.sm }]}>
              {tr("shifts.request_sent")}
            </Text>
          ) : null}
        </Card>

        {/* ── What the driver holds ── */}
        {mine.length > 0 ? (
          <ListGroup header={tr("shifts.mine")}>
            {mine.map((row) => (
              <ListRow
                key={row.key}
                title={dayLabel(row.day)}
                subtitle={`${row.window}${row.area ? ` · ${row.area}` : ""}${row.note ? `\n${row.note}` : ""}`}
                trailing={
                  row.pendingRequestId ? (
                    <TouchableOpacity
                      onPress={() => void withdraw(row.pendingRequestId!)}
                      disabled={busyCancel === row.pendingRequestId}
                      activeOpacity={0.7}
                      style={styles.withdrawWrap}
                    >
                      <Pill label={row.label} color={row.color} />
                      <Text style={[t.caption2, { color: c.secondaryLabel }]}>
                        {tr("shifts.withdraw")}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Pill label={row.label} color={row.color} />
                  )
                }
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

        {past.length > 0 ? (
          <ListGroup header={tr("shifts.past")}>
            {past.slice(0, 15).map((s) => (
              <ListRow
                key={s.id}
                title={dayLabel(isoDayOf(s.date))}
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
  dayStrip: { gap: space.sm, paddingVertical: space.md, paddingEnd: space.base },
  dayCell: {
    width: 54,
    paddingVertical: space.sm,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: c.gray4,
    backgroundColor: c.groupedBackground,
    ...continuous,
  },
  zoneLine: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.gray4,
  },
  bookButton: { minWidth: 96, marginTop: 0 },
  takenPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: space.md, paddingVertical: 6,
    borderRadius: radius.capsule, backgroundColor: c.groupedBackground, ...continuous,
  },
  withdrawWrap: { alignItems: "flex-end", gap: 2 },
});
