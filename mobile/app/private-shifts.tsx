/**
 * private-shifts.tsx — revision 24 (#11).
 *
 * Client note: "For the driver, it is optional to book the normal shift or
 * book a private shift. If he books the private shift, he must start the
 * shift at the vendor's location, and after delivering any order he must come
 * back directly to the vendor's location, or time will be deducted from the
 * driver. Also, he must remain at the vendor's location while not having
 * orders, until the shift finishes, or time will be deducted from him."
 *
 * So the screen leads with the running shift and where the driver stands
 * against those rules right now (at the shop, on an order, driving back with
 * the minutes left to get there, away and losing time), then the driver's
 * bookings, then the open shifts that match their vehicle. Start takes a fix
 * and the server refuses it more than 150 m from the shop, with the distance.
 *
 * Entry point: the Shifts tab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Store } from "lucide-react-native";
import {
  bookPrivateShift,
  endPrivateShift,
  fetchCurrentPrivateShift,
  fetchPrivateShifts,
  kuwaitClock,
  releasePrivateShift,
  startPrivateShift,
  type CurrentPrivateShift,
  type DriverPrivateShift,
  type LiveState,
  type PrivateShiftsResponse,
} from "../src/api/privateShifts";
import { isApiError } from "../src/api/client";
import { Button, Card, ListGroup, ListRow, NavBar, Pill, Screen } from "../src/components/hig";
import { getCurrentLocation, startBeacon } from "../src/services/locationService";
import { useDriverStore } from "../src/store/driverStore";
import { t as tr } from "../src/i18n/strings";
import { confirmAction, showAlert } from "../src/utils/alert";
import { useTheme, type Palette, space } from "../src/theme";

const POLL_MS = 30_000;

function shopName(s: DriverPrivateShift): string {
  return [s.vendor?.name, s.branch?.name].filter(Boolean).join(" · ");
}

function timeRange(s: DriverPrivateShift): string {
  return tr("private.time_range", { date: s.date, from: kuwaitClock(s.startAt), to: kuwaitClock(s.endAt) });
}

export default function PrivateShiftsScreen() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const setAvailability = useDriverStore((s) => s.setAvailability);

  const [list, setList] = useState<PrivateShiftsResponse | null>(null);
  const [current, setCurrent] = useState<CurrentPrivateShift | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, cur] = await Promise.all([fetchPrivateShifts(), fetchCurrentPrivateShift()]);
      setList(l);
      setCurrent(cur);
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // The live card moves with the driver, so it refreshes on its own.
  useEffect(() => {
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const act = useCallback(
    async (id: string, fn: () => Promise<unknown>, done?: string) => {
      setBusyId(id);
      try {
        await fn();
        if (done) showAlert(done);
        await load();
      } catch (e) {
        if (isApiError(e, 409) && e.code === "NOT_AT_VENDOR") {
          showAlert(
            tr("private.not_at_shop_title"),
            tr("private.not_at_shop_body", { distance: String(e.body?.distanceM ?? "?"), radius: String(e.body?.radiusM ?? 150) }),
          );
        } else {
          showAlert(tr("private.error_title"), (e as Error)?.message ?? "");
        }
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const onStart = useCallback(
    (id: string) =>
      act(id, async () => {
        let where: { latitude: number; longitude: number } | null = null;
        try {
          const fix = await getCurrentLocation();
          if (fix) where = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
        } catch {
          /* no fix: the server lets the start through with a warning */
        }
        await startPrivateShift(id, where);
        // On duty means on the board: the server put the driver online, and
        // the location beacon is what the stay-at-the-shop rule is read from.
        await setAvailability("ONLINE");
        startBeacon().catch(() => {});
      }),
    [act, setAvailability],
  );

  const onEnd = useCallback(
    (id: string) =>
      confirmAction({
        title: tr("private.end_title"),
        message: tr("private.end_body"),
        confirmLabel: tr("private.end"),
        cancelLabel: tr("common.cancel"),
        onConfirm: () => void act(id, () => endPrivateShift(id), tr("private.ended")),
      }),
    [act],
  );

  const stateLabel = (state: LiveState, returnByAt: string | null): { label: string; color: string; fill: string } => {
    switch (state) {
      case "AT_VENDOR":
        return { label: tr("private.state_at_shop"), color: c.green, fill: c.greenFill };
      case "ON_ORDER":
        return { label: tr("private.state_on_order"), color: c.blue, fill: c.navyFill };
      case "RETURNING":
        return {
          label: tr("private.state_returning", { time: returnByAt ? kuwaitClock(returnByAt) : "" }),
          color: c.orange,
          fill: c.orangeFill,
        };
      case "AWAY":
        return { label: tr("private.state_away"), color: c.red, fill: c.redFill };
      default:
        return { label: tr("private.state_unknown"), color: c.secondaryLabel, fill: c.tintFill };
    }
  };

  const running = current?.shift ?? null;
  const live = current?.live ?? null;
  const upcoming = (list?.mine ?? []).filter((s) => s.status === "BOOKED" && s.id !== running?.id);
  const finished = (list?.mine ?? []).filter((s) => s.status === "COMPLETED");

  return (
    <Screen>
      <NavBar title={tr("private.title")} />
      {status === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : status === "error" ? (
        <View style={styles.center}>
          <Text style={[t.headline]}>{tr("private.load_error")}</Text>
          <Button title={tr("common.retry")} variant="tinted" style={{ marginTop: space.xl, alignSelf: "stretch" }} onPress={() => void load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.base, gap: space.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={[t.footnote, { color: c.secondaryLabel }]}>{tr("private.rules")}</Text>

          {running && (
            <Card>
              <View style={{ gap: space.sm }}>
                <Text style={t.headline}>{shopName(running)}</Text>
                <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{timeRange(running)}</Text>
                {running.status === "IN_PROGRESS" && live ? (
                  <>
                    {(() => {
                      const s = stateLabel(live.state, live.returnByAt);
                      return <Pill label={s.label} color={s.color} fill={s.fill} />;
                    })()}
                    {live.state === "AWAY" && (
                      <Text style={[t.footnote, { color: c.red }]}>{tr("private.away_hint")}</Text>
                    )}
                    <Text style={[t.footnote, { color: c.secondaryLabel }]}>
                      {tr("private.deducted_so_far", { minutes: String(live.deductedMinutes) })}
                    </Text>
                    <Button
                      title={tr("private.end")}
                      variant="destructive"
                      disabled={busyId === running.id}
                      onPress={() => onEnd(running.id)}
                    />
                  </>
                ) : (
                  <>
                    <Text style={[t.footnote, { color: c.secondaryLabel }]}>
                      {tr("private.start_hint", { radius: String(running.radiusM), time: kuwaitClock(running.canStartAt) })}
                    </Text>
                    <Button
                      title={tr("private.start")}
                      disabled={busyId === running.id || Date.now() < new Date(running.canStartAt).getTime()}
                      onPress={() => void onStart(running.id)}
                    />
                  </>
                )}
              </View>
            </Card>
          )}

          {upcoming.length > 0 && (
            <ListGroup header={tr("private.my_bookings")}>
              {upcoming.map((s) => (
                <ListRow
                  key={s.id}
                  icon={<Store size={18} color={c.tint} />}
                  title={shopName(s)}
                  subtitle={timeRange(s)}
                  trailing={
                    <Button
                      title={tr("private.give_back")}
                      variant="plain"
                      disabled={busyId === s.id}
                      onPress={() => void act(s.id, () => releasePrivateShift(s.id))}
                    />
                  }
                />
              ))}
            </ListGroup>
          )}

          {!list?.eligible ? (
            <Card>
              <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{tr("private.not_eligible")}</Text>
            </Card>
          ) : (
            <ListGroup header={tr("private.open_shifts")} footer={tr("private.open_hint")}>
              {(list?.open ?? []).length === 0 ? (
                <ListRow title={tr("private.none_open")} />
              ) : (
                (list?.open ?? []).map((s) => (
                  <ListRow
                    key={s.id}
                    testID={`private-open-${s.id}`}
                    icon={<Store size={18} color={c.tint} />}
                    title={shopName(s)}
                    subtitle={timeRange(s)}
                    trailing={
                      <Button
                        title={tr("private.book")}
                        variant="tinted"
                        disabled={busyId === s.id}
                        onPress={() => void act(s.id, () => bookPrivateShift(s.id), tr("private.booked"))}
                      />
                    }
                  />
                ))
              )}
            </ListGroup>
          )}

          {finished.length > 0 && (
            <ListGroup header={tr("private.finished")}>
              {finished.map((s) => (
                <ListRow
                  key={s.id}
                  title={shopName(s)}
                  subtitle={timeRange(s)}
                  detail={
                    s.billableMinutes == null
                      ? undefined
                      : tr("private.paid_minutes", { paid: String(s.billableMinutes), of: String(s.scheduledMinutes ?? 0) })
                  }
                />
              ))}
            </ListGroup>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  });
