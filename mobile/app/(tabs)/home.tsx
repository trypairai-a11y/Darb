import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Easing, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { ChevronRight, MapPinOff, Phone, TriangleAlert } from "lucide-react-native";
import { Card, Screen } from "../../src/components/hig";
import { t as tr } from "../../src/i18n/strings";
import { DemandHeatMap } from "../../src/components/DemandHeatMap";
import { DriverProfileCard } from "../../src/components/DriverProfileCard";
import { PermissionRationale } from "../../src/components/PermissionRationale";
import { WebShiftBanner } from "../../src/components/WebShiftBanner";
import { hydrateNow } from "../../src/services/offerChannel";
import { registerForPushNotifications } from "../../src/services/pushNotifications";
import { useDriverStore } from "../../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";
import type { Availability } from "../../src/api/client";

/**
 * Client request, 2026-08-06: the Online/Offline switch is a Settings control
 * now, and Busy is not a choice at all.
 *
 * Busy was never a state a driver should pick: the server sets it the moment an
 * offer is accepted and clears it when the delivery ends, so the button could
 * only ever do one of two things — nothing, or take a driver off dispatch under
 * a name that reads like they are working. It is still a status this screen can
 * show, because the server still sets it; it is no longer one anybody presses.
 *
 * What is left here is the status, not the switch: a driver who is offline has
 * to be able to see it from Home, and the row says where the switch went rather
 * than being a second one.
 */
const STATUS_LABEL_KEYS: Record<Availability, string> = {
  ONLINE: "home.status.online",
  BUSY: "home.status.busy",
  OFFLINE: "home.status.offline",
};

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
  const lockout = useDriverStore((s) => s.lockout);
  const activeOrder = useDriverStore((s) => s.activeOrder);
  const supervisorPhone = useDriverStore((s) => s.supervisorPhone);

  const [refreshing, setRefreshing] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [showRationale, setShowRationale] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const checkPermissions = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        // Browsers only have a foreground grant — background is out of scope.
        const fg = await Location.getForegroundPermissionsAsync();
        setLocationGranted(fg.status === "granted");
        return;
      }
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

  const onRationaleComplete = useCallback(() => {
    setShowRationale(false);
    void checkPermissions();
  }, [checkPermissions]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([hydrateNow(), checkPermissions()]).finally(() => setRefreshing(false));
  }, [checkPermissions]);

  const statusColor = availability === "ONLINE" ? c.tint : availability === "BUSY" ? c.orange : c.gray;
  const idleOnline = availability === "ONLINE" && !activeOrder && !lockout.active;
  const initials =
    (driver?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

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
          {/*
            The gear that used to sit here is gone: Settings is a tab of its own
            since 2026-08-04, and two doors onto one screen is how a driver ends
            up unsure which one holds their points.

            This is not that gear back. Client request, 2026-08-06: a small
            button on Home that opens the driver's own details. It is a card of
            four facts, not a screen, which is why it is a modal and not a
            second route into Settings.
          */}
          <TouchableOpacity
            style={styles.profileBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={tr("profile.title")}
            testID="home-profile-button"
            onPress={() => setShowProfile(true)}
          >
            <Text style={[t.subheadline, { color: c.onTint, fontFamily: undefined, fontWeight: "700" }]}>
              {initials}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Web-only: keep-tab-open / location-blocked advisory while on shift */}
        <WebShiftBanner />

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

        {/*
          ─── Status, not the switch ───

          The three buttons that used to sit here are in Settings (client
          request, 2026-08-06), and Busy is gone from them entirely. Leaving
          nothing behind was the wrong answer: an offline driver receives no
          offers, and the reason has to be legible from the first screen they
          open. So the state stays and the row says where the switch is, and it
          opens it — a status that a driver cannot act on is the dead end this
          whole revision is about.
        */}
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          testID="home-status-row"
          onPress={() => router.push("/settings")}
        >
          <Card style={idleOnline ? styles.cardLive : undefined}>
            <View style={styles.statusRow}>
              {idleOnline ? <PulseRing color={c.tint} /> : (
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              )}
              <Text style={[t.title2, { flex: 1 }]}>
                {idleOnline ? tr("home.waiting") : tr(STATUS_LABEL_KEYS[availability])}
              </Text>
              <ChevronRight size={18} color={c.gray} />
            </View>
            <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 4 }]}>
              {availability === "OFFLINE"
                ? tr("home.offline_in_settings")
                : availability === "BUSY"
                  ? tr("home.busy_hint")
                  : tr("home.waiting_sub")}
            </Text>
          </Card>
        </TouchableOpacity>

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

        {/*
          ─── Demand heat map ───

          Client request, 2026-08-04: Home is the status toggle and the heat map,
          nothing else. The three earnings tiles that used to sit here (deliveries
          today, collected today, cash on hand) were not deleted, they are the top
          of the Wallet tab and were showing twice.

          Darb Points and Rider support moved to Settings, where the same request
          put them. Support is also on the delivery screen now, which is where a
          driver actually needs it: mid-order, not before one.
        */}
        <DemandHeatMap />

        {/*
          ─── Permission health ───

          Only when it is broken. The green "location sharing active" row it used
          to draw was a permanent line of reassurance nobody read, and this screen
          is meant to be two things now. A denied grant still has to say so here:
          it is the reason Online will refuse, and hiding that would leave the
          toggle failing with no explanation on screen.
        */}
        {locationGranted === false ? (
          <TouchableOpacity
            style={[styles.permRow, styles.permRowWarn]}
            activeOpacity={0.8}
            testID="home-location-warning"
            onPress={() => setShowRationale(true)}
          >
            <MapPinOff size={18} color={c.orange} />
            <View style={{ flex: 1 }}>
              <Text style={[t.subheadline, { color: c.warnLabel }]}>{tr("home.permission_warning")}</Text>
              <Text style={[t.footnote, { color: c.warnLabel2, marginTop: 1 }]}>
                {tr("home.permission_warning_sub")}
              </Text>
            </View>
            <ChevronRight size={16} color={c.warnLabel2} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <PermissionRationale visible={showRationale} onComplete={onRationaleComplete} />
      <DriverProfileCard
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        driver={driver}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xxxl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.base },
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
  profileBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: c.tint,
    alignItems: "center", justifyContent: "center", ...continuous,
  },
  resume: {
    marginTop: space.md, backgroundColor: c.tint, borderRadius: radius.card, padding: space.base,
    flexDirection: "row", alignItems: "center", gap: space.md, ...continuous, ...shadow.glow,
  },
  permRow: {
    flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg,
    backgroundColor: c.groupedSecondary, borderRadius: radius.card, padding: space.base,
    borderWidth: 1, borderColor: c.hairline, ...continuous,
  },
  permRowWarn: { backgroundColor: c.warnBg, borderColor: "rgba(255,184,77,0.22)" },
});
