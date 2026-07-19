import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Animated, Easing, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { ChevronRight, MapPin, MapPinOff, Phone, Settings, TriangleAlert } from "lucide-react-native";
import { Card, Screen } from "../../src/components/hig";
import { formatKwd } from "../../src/i18n/format";
import { t as tr } from "../../src/i18n/strings";
import { PermissionRationale } from "../../src/components/PermissionRationale";
import { hydrateNow } from "../../src/services/offerChannel";
import { startBeacon, stopBeacon } from "../../src/services/locationService";
import { registerForPushNotifications } from "../../src/services/pushNotifications";
import { useDriverStore } from "../../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";
import type { Availability } from "../../src/api/client";

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: "ONLINE", label: tr("home.status.online") },
  { value: "BUSY", label: tr("home.status.busy") },
  { value: "OFFLINE", label: tr("home.status.offline") },
];

function PulseRing({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  return (
    <View style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: color, transform: [{ scale }], opacity }} />
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const driver = useDriverStore((s) => s.driver);
  const availability = useDriverStore((s) => s.availability);
  const availabilitySync = useDriverStore((s) => s.availabilitySync);
  const lockout = useDriverStore((s) => s.lockout);
  const activeOrder = useDriverStore((s) => s.activeOrder);
  const wallet = useDriverStore((s) => s.wallet);
  const supervisorPhone = useDriverStore((s) => s.supervisorPhone);
  const setAvailability = useDriverStore((s) => s.setAvailability);

  const [refreshing, setRefreshing] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [showRationale, setShowRationale] = useState(false);
  const pendingOnline = useRef(false);

  const checkPermissions = useCallback(async () => {
    try {
      const [fg, bg] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      setLocationGranted(fg.status === "granted" && bg.status === "granted");
    } catch {
      setLocationGranted(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPermissions();
      void hydrateNow();
    }, [checkPermissions]),
  );

  useEffect(() => {
    registerForPushNotifications().catch(() => {});
  }, []);

  const applyAvailability = useCallback(
    async (next: Availability) => {
      const res = await setAvailability(next);
      if (!res.ok) {
        const msg =
          res.reason === "CASH_CEILING_LOCKOUT"
            ? tr("home.lockout_body")
            : res.reason === "ACTIVE_ORDER"
              ? tr("home.busy_hint")
              : res.reason ?? "";
        Alert.alert(tr("home.availability_error"), msg);
        return;
      }
      if (next === "ONLINE") {
        startBeacon().catch(() => {});
      } else if (next === "OFFLINE") {
        stopBeacon().catch(() => {});
      }
    },
    [setAvailability],
  );

  const onSelectAvailability = useCallback(
    (next: Availability) => {
      if (next === availability || availabilitySync === "pending") return;
      if (next === "ONLINE" && locationGranted === false) {
        pendingOnline.current = true;
        setShowRationale(true);
        return;
      }
      void applyAvailability(next);
    },
    [availability, availabilitySync, locationGranted, applyAvailability],
  );

  const onRationaleComplete = useCallback(
    (granted: boolean) => {
      setShowRationale(false);
      void checkPermissions();
      if (granted && pendingOnline.current) {
        pendingOnline.current = false;
        void applyAvailability("ONLINE");
      }
      pendingOnline.current = false;
    },
    [applyAvailability, checkPermissions],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([hydrateNow(), checkPermissions()]).finally(() => setRefreshing(false));
  }, [checkPermissions]);

  const statusColor = availability === "ONLINE" ? c.tint : availability === "BUSY" ? c.orange : c.gray;
  const idleOnline = availability === "ONLINE" && !activeOrder && !lockout.active;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[t.footnote, { color: c.tint, letterSpacing: 1.4, textTransform: "uppercase" }]}>
              {tr("enroll.kicker")}
            </Text>
            <Text style={t.largeTitle} numberOfLines={1}>{driver?.name || "Driver"}</Text>
          </View>
          <TouchableOpacity
            style={styles.gear}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
          >
            <Settings size={20} color={c.label} />
          </TouchableOpacity>
        </View>

        {lockout.active ? (
          <View style={styles.lockout}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <TriangleAlert size={18} color={c.warnLabel} />
              <Text style={[t.subheadline, { color: c.warnLabel, fontFamily: undefined, fontWeight: "700", flex: 1 }]}>
                {tr("home.lockout_title")}
              </Text>
            </View>
            <Text style={[t.footnote, { color: c.warnLabel2, marginTop: 4 }]}>{tr("home.lockout_body")}</Text>
            {supervisorPhone ? (
              <TouchableOpacity
                style={styles.lockoutCall}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(`tel:${supervisorPhone}`).catch(() => {})}
              >
                <Phone size={15} color={c.onTint} />
                <Text style={[t.subheadline, { color: c.onTint, fontFamily: undefined, fontWeight: "700" }]}>
                  {tr("common.call_supervisor")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ─── Availability control ─── */}
        <Card style={idleOnline ? styles.cardLive : undefined}>
          <View style={styles.statusRow}>
            {idleOnline ? <PulseRing color={c.tint} /> : (
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            )}
            <Text style={[t.title2, { flex: 1 }]}>
              {idleOnline ? tr("home.waiting") : AVAILABILITY_OPTIONS.find((o) => o.value === availability)?.label}
            </Text>
            {availabilitySync === "pending" ? (
              <Text style={[t.caption1, { color: c.secondaryLabel }]}>…</Text>
            ) : null}
          </View>
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4 }]}>
            {availability === "OFFLINE"
              ? tr("home.offline_hint")
              : availability === "BUSY"
                ? tr("home.busy_hint")
                : tr("home.waiting_sub")}
          </Text>

          <View style={styles.availability}>
            {AVAILABILITY_OPTIONS.map((o) => {
              const active = o.value === availability;
              const tintFor = o.value === "ONLINE" ? c.tint : o.value === "BUSY" ? c.orange : c.gray2;
              return (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.availabilityBtn, active && { backgroundColor: tintFor, borderColor: tintFor }]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={availabilitySync === "pending"}
                  onPress={() => onSelectAvailability(o.value)}
                >
                  <Text
                    style={[
                      t.headline,
                      { color: active ? (o.value === "ONLINE" ? c.onTint : c.systemBackground) : c.secondaryLabel },
                    ]}
                  >
                    {o.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {activeOrder ? (
          <TouchableOpacity style={styles.resume} activeOpacity={0.85} onPress={() => router.replace("/delivery")}>
            <View style={{ flex: 1 }}>
              <Text style={[t.headline, { color: c.onTint }]}>{tr("home.resume_delivery")}</Text>
              <Text style={[t.footnote, { color: c.onTint, opacity: 0.75, marginTop: 1 }]} numberOfLines={1}>
                {activeOrder.pickup?.name || activeOrder.orderNumber || activeOrder.id}
              </Text>
            </View>
            <ChevronRight size={20} color={c.onTint} />
          </TouchableOpacity>
        ) : null}

        {/* ─── Today ─── */}
        <View style={styles.grid}>
          <Metric label={tr("home.deliveries")} value={String(wallet?.todayDeliveries ?? 0)} accent />
          <Metric label={tr("home.collected")} value={formatKwd(wallet?.todayCollectedKwd)} />
        </View>
        <View style={[styles.grid, { marginTop: space.md }]}>
          <Metric label={tr("home.cash_on_hand")} value={formatKwd(wallet?.cashOnHandKwd)} wide />
        </View>

        {/* ─── Permission health ─── */}
        <TouchableOpacity
          style={[styles.permRow, locationGranted === false && styles.permRowWarn]}
          activeOpacity={locationGranted === false ? 0.8 : 1}
          onPress={() => {
            if (locationGranted === false) setShowRationale(true);
          }}
        >
          {locationGranted === false ? (
            <MapPinOff size={18} color={c.orange} />
          ) : (
            <MapPin size={18} color={c.tint} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[t.subheadline, { color: locationGranted === false ? c.warnLabel : c.label }]}>
              {locationGranted === false ? tr("home.permission_warning") : tr("home.permission_ok")}
            </Text>
            {locationGranted === false ? (
              <Text style={[t.footnote, { color: c.warnLabel2, marginTop: 1 }]}>
                {tr("home.permission_warning_sub")}
              </Text>
            ) : null}
          </View>
          {locationGranted === false ? <ChevronRight size={16} color={c.warnLabel2} /> : null}
        </TouchableOpacity>
      </ScrollView>

      <PermissionRationale visible={showRationale} onComplete={onRationaleComplete} />
    </Screen>
  );
}

function Metric({ label, value, accent, wide }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[styles.metric, wide && { width: "100%" }]}>
      <Text style={[t.title1, { color: accent ? c.tint : c.label }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 3 }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xxxl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.base },
  gear: {
    width: 42, height: 42, borderRadius: radius.capsule, backgroundColor: c.groupedSecondary,
    borderWidth: 1, borderColor: c.hairline, alignItems: "center", justifyContent: "center",
  },
  lockout: {
    backgroundColor: c.warnBg, borderRadius: radius.card, padding: space.base, marginBottom: space.md,
    borderWidth: 1, borderColor: "rgba(255,184,77,0.22)", ...continuous,
  },
  lockoutCall: {
    marginTop: space.md, height: 40, borderRadius: radius.button, backgroundColor: c.orange,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, ...continuous,
  },
  cardLive: { borderColor: "rgba(198,255,58,0.35)" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  availability: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  availabilityBtn: {
    flex: 1, height: 56, borderRadius: radius.button, alignItems: "center", justifyContent: "center",
    backgroundColor: c.tertiaryFill, borderWidth: 1, borderColor: c.hairline, ...continuous,
  },
  resume: {
    marginTop: space.md, backgroundColor: c.tint, borderRadius: radius.card, padding: space.base,
    flexDirection: "row", alignItems: "center", gap: space.md, ...continuous, ...shadow.glow,
  },
  grid: { flexDirection: "row", gap: space.md, marginTop: space.md },
  metric: {
    flex: 1, backgroundColor: c.groupedSecondary, borderRadius: radius.card,
    padding: space.base, borderWidth: 1, borderColor: c.hairline, ...continuous, ...shadow.card,
  },
  permRow: {
    flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg,
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base,
    borderWidth: 1, borderColor: c.hairline, ...continuous,
  },
  permRowWarn: { backgroundColor: c.warnBg, borderColor: "rgba(255,184,77,0.22)" },
});
