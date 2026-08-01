import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Easing, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Check, Phone, Siren } from "lucide-react-native";
import { Button, Screen } from "../../src/components/hig";
import { formatClock, formatKwd } from "../../src/i18n/format";
import { t as tr } from "../../src/i18n/strings";
import { enqueueOrderStatus, flushEventOutbox } from "../../src/services/eventOutbox";
import { availableNavApps, openNav, type NavApp } from "../../src/services/navLinks";
import { WebShiftBanner } from "../../src/components/WebShiftBanner";
import { STAGE_ORDER, nextStage, stageIndex, useDriverStore } from "../../src/store/driverStore";
import { remainingMsSigned } from "../../src/utils/countdown";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";

const NAV_LABEL: Record<NavApp, string> = {
  google: "Google Maps",
  waze: "Waze",
  apple: "Apple Maps",
};

async function bestEffortCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {}
  return null;
}

function SlaBanner({ deadline }: { deadline: string }) {
  const { c, t } = useTheme();
  const clockSkewMs = useDriverStore((s) => s.clockSkewMs);
  const [ms, setMs] = useState(() => remainingMsSigned(deadline, clockSkewMs));
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => setMs(remainingMsSigned(deadline, clockSkewMs)), 1000);
    return () => clearInterval(id);
  }, [deadline, clockSkewMs]);

  const overdue = ms < 0;
  useEffect(() => {
    if (!overdue) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [overdue, pulse]);

  const amber = !overdue && ms < 10 * 60_000;
  const bg = overdue ? c.redFill : amber ? c.warnBg : c.tertiaryFill;
  const fg = overdue ? c.red : amber ? c.warnLabel : c.secondaryLabel;
  const label = overdue
    ? tr("delivery.sla_overdue", { time: formatClock(-ms) })
    : tr("delivery.sla_remaining", { time: formatClock(ms) });

  return (
    <Animated.View style={{
      opacity: overdue ? pulse : 1, backgroundColor: bg, borderRadius: radius.field,
      paddingVertical: 10, paddingHorizontal: space.base, alignItems: "center", ...continuous,
    }}>
      <Text style={[t.subheadline, { color: fg, fontFamily: undefined, fontWeight: "700" }]}>{label}</Text>
    </Animated.View>
  );
}

export default function DeliveryScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const order = useDriverStore((s) => s.activeOrder);
  const advanceOrder = useDriverStore((s) => s.advanceOrder);
  const pendingEventCount = useDriverStore((s) => s.pendingEventCount);
  const [advancing, setAdvancing] = useState(false);

  const onAdvance = useCallback(async () => {
    if (!order || advancing) return;
    if (order.stage === "ARRIVED_AT_DROPOFF") {
      router.push("/delivery/pod");
      return;
    }
    const next = nextStage(order.stage);
    if (!next) return;
    // Arriving at the restaurant needs a photo before the step counts (client
    // request, 2026-08-01). The capture screen advances the stage itself, so
    // this returns rather than falling through and advancing twice.
    if (next === "ARRIVED_AT_PICKUP") {
      router.push("/delivery/arrival");
      return;
    }
    setAdvancing(true);
    try {
      const coords = await bestEffortCoords();
      await enqueueOrderStatus(order.id, next, coords);
      advanceOrder(next); // optimistic — hydrate never regresses past this
      flushEventOutbox().catch(() => {});
      // Arriving at the customer goes straight into the proof-of-delivery flow.
      if (next === "ARRIVED_AT_DROPOFF") router.push("/delivery/pod");
    } finally {
      setAdvancing(false);
    }
  }, [order, advancing, advanceOrder, router]);

  if (!order) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Text style={t.title2}>{tr("delivery.no_order")}</Text>
          <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 6, textAlign: "center" }]}>
            {tr("delivery.no_order_sub")}
          </Text>
          <Button title={tr("common.back")} variant="tinted" style={{ marginTop: space.xl, alignSelf: "stretch" }}
            onPress={() => router.replace("/(tabs)/home")} />
        </View>
      </Screen>
    );
  }

  const beforePickup = stageIndex(order.stage) < stageIndex("PICKED_UP");
  const target = beforePickup ? order.pickup : order.dropoff;
  const targetCoords =
    target?.lat != null && target?.lng != null ? { lat: Number(target.lat), lng: Number(target.lng) } : null;
  const codAmount = Number(order.codAmountKwd ?? 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <WebShiftBanner />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[t.footnote, { color: c.tint, letterSpacing: 1.4, textTransform: "uppercase" }]}>
              {tr("delivery.title")}
            </Text>
            <Text style={t.title1} numberOfLines={1}>
              {order.pickup?.name || order.orderNumber || `#${order.id.slice(-6)}`}
            </Text>
          </View>
          {pendingEventCount > 0 ? (
            <View style={styles.syncPill}>
              <Text style={[t.caption1, { color: c.warnLabel }]}>
                {tr("common.syncing", { count: pendingEventCount })}
              </Text>
            </View>
          ) : null}
        </View>

        {order.slaDeadline ? <SlaBanner deadline={order.slaDeadline} /> : null}

        {/* ─── Stepper ─── */}
        <View style={styles.stepper}>
          {STAGE_ORDER.map((stage, i) => {
            const done = stageIndex(order.stage) > i;
            const current = order.stage === stage;
            return (
              <View key={stage} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={[
                    styles.stepDot,
                    done && { backgroundColor: c.tint, borderColor: c.tint },
                    current && { borderColor: c.tint, backgroundColor: c.tintFill },
                  ]}>
                    {done ? <Check size={13} color={c.onTint} strokeWidth={3.2} /> : null}
                    {current ? <View style={styles.stepCore} /> : null}
                  </View>
                  {i < STAGE_ORDER.length - 1 ? (
                    <View style={[styles.stepLine, done && { backgroundColor: c.tint }]} />
                  ) : null}
                </View>
                <Text
                  style={[
                    t.body,
                    { paddingTop: 3, flex: 1 },
                    done && { color: c.secondaryLabel },
                    current && { color: c.label, fontFamily: undefined, fontWeight: "700" },
                    !done && !current && { color: c.tertiaryLabel },
                  ]}
                >
                  {tr(`delivery.stage.${stage}`)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ─── Destination + navigation ─── */}
        <View style={styles.card}>
          <Text style={[t.caption1, { color: c.secondaryLabel, textTransform: "uppercase", letterSpacing: 1 }]}>
            {beforePickup ? tr("offer.pickup") : tr("offer.dropoff")}
          </Text>
          <Text style={[t.headline, { marginTop: 4 }]} numberOfLines={2}>
            {beforePickup
              ? [order.pickup?.name, order.pickup?.address].filter(Boolean).join(" · ") || "—"
              : order.dropoff?.address || order.customerName || "—"}
          </Text>
          {targetCoords ? (
            <View style={styles.navRow}>
              {availableNavApps().map((app) => (
                <TouchableOpacity
                  key={app}
                  style={styles.navBtn}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  onPress={() => void openNav(app, targetCoords)}
                >
                  <Text style={[t.footnote, { color: c.tint, fontFamily: undefined, fontWeight: "700" }]}>
                    {NAV_LABEL[app]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {!beforePickup && order.customerPhone ? (
            <TouchableOpacity
              style={styles.callRow}
              activeOpacity={0.75}
              onPress={() => Linking.openURL(`tel:${order.customerPhone}`).catch(() => {})}
            >
              <Phone size={15} color={c.tint} />
              <Text style={[t.subheadline, { color: c.tint, fontFamily: undefined, fontWeight: "700" }]}>
                {tr("delivery.call_customer")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ─── COD ─── */}
        {codAmount > 0 ? (
          <View style={[styles.card, { backgroundColor: c.warnBg, borderColor: "rgba(255,184,77,0.22)" }]}>
            <Text style={[t.caption1, { color: c.warnLabel2, textTransform: "uppercase", letterSpacing: 1 }]}>
              {tr("delivery.cod_title")}
            </Text>
            <Text style={[t.title1, { color: c.warnLabel, marginTop: 4 }]}>{formatKwd(codAmount)}</Text>
            <Text style={[t.footnote, { color: c.warnLabel2, marginTop: 2 }]}>
              {tr("delivery.cod_body", { amount: formatKwd(codAmount) })}
            </Text>
          </View>
        ) : null}

        {/* ─── Primary action ─── */}
        <Button
          title={tr(`delivery.next.${order.stage}`)}
          onPress={() => void onAdvance()}
          disabled={advancing}
          style={{ marginTop: space.lg, height: 60 }}
        />

        <TouchableOpacity
          style={styles.failedLink}
          activeOpacity={0.7}
          accessibilityRole="button"
          onPress={() => router.push("/delivery/failed")}
        >
          <Text style={[t.subheadline, { color: c.red }]}>{tr("delivery.failed_link")}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ─── SOS FAB ─── */}
      <TouchableOpacity
        style={styles.sos}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="SOS"
        onPress={() => router.push("/sos")}
      >
        <Siren size={24} color={c.white} />
      </TouchableOpacity>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: 120 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.md },
  syncPill: {
    backgroundColor: c.warnBg, borderRadius: radius.capsule, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4,
  },
  stepper: { marginTop: space.lg, marginBottom: space.sm, paddingHorizontal: 2 },
  step: { flexDirection: "row", gap: space.md },
  stepRail: { alignItems: "center", width: 24 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.gray4,
    backgroundColor: c.groupedSecondary, alignItems: "center", justifyContent: "center",
  },
  stepCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.tint },
  stepLine: { width: 2, flexGrow: 1, minHeight: 18, backgroundColor: c.gray5, marginVertical: 2 },
  card: {
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base,
    borderWidth: 1, borderColor: c.hairline, marginTop: space.md, ...continuous, ...shadow.card,
  },
  navRow: { flexDirection: "row", gap: space.sm, marginTop: space.md, flexWrap: "wrap" },
  navBtn: {
    backgroundColor: c.tintFill, borderRadius: radius.capsule, paddingHorizontal: 14, paddingVertical: 9,
  },
  callRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: space.md },
  failedLink: { alignSelf: "center", marginTop: space.lg, padding: space.sm },
  sos: {
    position: "absolute", right: space.lg, bottom: space.xxl, width: 60, height: 60, borderRadius: 30,
    backgroundColor: c.red, alignItems: "center", justifyContent: "center", ...shadow.floating,
  },
});
