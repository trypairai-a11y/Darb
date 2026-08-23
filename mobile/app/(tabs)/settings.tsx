import { useCallback, useMemo, useRef, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Award, Bell, Check, LifeBuoy, LogOut, MapPin } from "lucide-react-native";
import { LargeTitle, ListGroup, ListRow, Screen } from "../../src/components/hig";
import { t as tr } from "../../src/i18n/strings";
import { PermissionRationale } from "../../src/components/PermissionRationale";
import { stopOfferChannel } from "../../src/services/offerChannel";
import { startBeacon, stopBeacon } from "../../src/services/locationService";
import { confirmAction, showAlert } from "../../src/utils/alert";
import { useDriverStore } from "../../src/store/driverStore";
import { useLanguageStore } from "../../src/store/languageStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";
import type { Availability } from "../../src/api/client";

/** Two states, because Busy is the server's to set and never the driver's. */
const AVAILABILITY_CHOICES: Availability[] = ["ONLINE", "OFFLINE"];

export default function SettingsScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const driver = useDriverStore((s) => s.driver);
  const reset = useDriverStore((s) => s.reset);
  const availability = useDriverStore((s) => s.availability);
  const availabilitySync = useDriverStore((s) => s.availabilitySync);
  const setAvailability = useDriverStore((s) => s.setAvailability);
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [showRationale, setShowRationale] = useState(false);
  /** Set while the location rationale is up, so a grant resumes the go-online
   *  the driver already asked for instead of making them press twice. */
  const pendingOnline = useRef(false);

  const checkPermissions = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        // Browsers only have a foreground location grant; push doesn't exist.
        const fg = await Location.getForegroundPermissionsAsync();
        setLocationGranted(fg.status === "granted");
        setNotifGranted(null);
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
    try {
      const n = await Notifications.getPermissionsAsync();
      setNotifGranted(n.status === "granted");
    } catch {
      setNotifGranted(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPermissions();
    }, [checkPermissions]),
  );

  /**
   * Going on and off shift, moved here from Home (client request, 2026-08-06).
   *
   * Two states, not three: Busy is set by the server when an offer is accepted
   * and cleared when the delivery ends, so a driver pressing it was either
   * doing nothing or quietly taking themselves off dispatch. The switch below
   * refuses while a delivery is live, which is the server's answer too
   * (ACTIVE_ORDER), and that refusal is why finishing the order is the only way
   * out of Busy.
   */
  const applyAvailability = useCallback(
    async (next: Availability) => {
      const res = await setAvailability(next);
      if (!res.ok) {
        const msg =
          res.reason === "CASH_CEILING_LOCKOUT"
            ? tr("home.lockout_body")
            : res.reason === "ACTIVE_ORDER"
              ? tr("home.busy_hint")
              : // Revision 16 (#5): the driver is standing outside the area Darb
                // assigned them, so the switch refuses and says where to go.
                res.reason === "OUTSIDE_ZONE"
                ? tr("settings.outside_zone_body")
                : res.reason ?? "";
        showAlert(tr("home.availability_error"), msg);
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
      // Online without a location grant would be a driver on the board the
      // dispatcher cannot see, so the rationale comes first and the go-online
      // resumes on the way back.
      if (next === "ONLINE" && locationGranted === false) {
        pendingOnline.current = true;
        setShowRationale(true);
        return;
      }
      void applyAvailability(next);
    },
    [availability, availabilitySync, locationGranted, applyAvailability],
  );

  const handleSignOut = useCallback(() => {
    // confirmAction falls back to window.confirm on web (RNW Alert is a no-op).
    confirmAction({
      title: tr("settings.sign_out_title"),
      message: tr("settings.sign_out_body"),
      confirmLabel: tr("settings.sign_out"),
      cancelLabel: tr("common.cancel"),
      destructive: true,
      onConfirm: () => {
        void (async () => {
          stopOfferChannel();
          try { const { stopBeacon } = await import("../../src/services/locationService"); await stopBeacon(); } catch {}
          try { const { unenroll } = await import("../../src/api/client"); await unenroll(); } catch {}
          reset();
          router.replace("/enrollment");
        })();
      },
    });
  }, [reset, router]);

  const initials =
    (driver?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  return (
    <Screen>
      {/*
        LargeTitle, not NavBar: this is a tab root since 2026-08-04, so there is
        nothing to go back to and a back chevron would have been a dead control.
      */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LargeTitle title={tr("settings.title")} />
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={[t.title1, { color: c.onTint, fontWeight: "700" }]}>{initials}</Text>
          </View>
          <Text style={[t.title2, { marginTop: space.md }]}>{driver?.name || "Driver"}</Text>
          {driver?.phone ? (
            <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2 }]}>{driver.phone}</Text>
          ) : null}
        </View>

        {/* ─── On shift ─── (client request, 2026-08-06) */}
        <View style={styles.shiftBlock} testID="settings-availability">
          <Text style={[t.footnote, { color: c.secondaryLabel, marginBottom: space.sm }]}>
            {tr("settings.availability")}
          </Text>
          <View style={styles.availability}>
            {AVAILABILITY_CHOICES.map((value) => {
              const active = value === availability || (value === "ONLINE" && availability === "BUSY");
              const tintFor = value === "ONLINE" ? c.tint : c.gray2;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.availabilityBtn, active && { backgroundColor: tintFor, borderColor: tintFor }]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={availabilitySync === "pending"}
                  testID={`settings-availability-${value.toLowerCase()}`}
                  onPress={() => onSelectAvailability(value)}
                >
                  <Text
                    style={[
                      t.headline,
                      { color: active ? (value === "ONLINE" ? c.onTint : c.systemBackground) : c.secondaryLabel },
                    ]}
                  >
                    {tr(value === "ONLINE" ? "home.status.online" : "home.status.offline")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[t.caption2, { color: c.secondaryLabel, marginTop: space.sm }]}>
            {availability === "BUSY"
              ? tr("home.busy_hint")
              : availability === "ONLINE"
                ? tr("home.waiting_sub")
                : tr("home.offline_hint")}
          </Text>
        </View>

        <ListGroup header={tr("settings.profile")}>
          <ListRow
            icon={<Award size={16} color={c.tint} />}
            title={tr("settings.my_points")}
            chevron
            testID="settings-my-points"
            onPress={() => router.push("/points")}
          />
        </ListGroup>

        {/*
          Notifications and support (client request, 2026-08-04).

          Notifications gave up its bottom-bar slot to Settings and lives here
          instead. The screen is unchanged and still routable at /alerts, so a
          push that deep-links into it keeps working.

          Rider support is here and on the delivery screen, and it is NOT the SOS
          button on either. SOS is the red emergency path for a driver in trouble
          right now; this is a bike that needs repair or a wrong deduction. One
          control for both would mean an emergency queuing behind a pay question.
        */}
        <ListGroup header={tr("settings.help")}>
          <ListRow
            icon={<Bell size={16} color={c.tint} />}
            title={tr("alerts.title")}
            chevron
            testID="settings-notifications"
            onPress={() => router.push("/alerts")}
          />
          <ListRow
            icon={<LifeBuoy size={16} color={c.tint} />}
            title={tr("support.title")}
            chevron
            testID="settings-rider-support"
            onPress={() => router.push("/support")}
          />
        </ListGroup>

        {/* Language switch — layout stays LTR; only the strings change. */}
        <ListGroup header={tr("settings.language")}>
          <ListRow
            title={tr("settings.lang_en")}
            trailing={lang === "en" ? <Check size={18} color={c.tint} /> : undefined}
            onPress={() => setLang("en")}
          />
          <ListRow
            title={tr("settings.lang_ar")}
            trailing={lang === "ar" ? <Check size={18} color={c.tint} /> : undefined}
            onPress={() => setLang("ar")}
          />
        </ListGroup>

        <ListGroup header={tr("settings.permissions")}>
          <ListRow
            icon={<MapPin size={16} color={locationGranted === false ? c.orange : c.tint} />}
            title={tr("settings.location_permission")}
            detail={locationGranted == null ? "—" : locationGranted ? tr("settings.granted") : tr("settings.fix")}
            chevron={locationGranted === false}
            onPress={locationGranted === false ? () => setShowRationale(true) : undefined}
          />
          <ListRow
            icon={<Bell size={16} color={notifGranted === false ? c.orange : c.tint} />}
            title={tr("settings.notifications_permission")}
            detail={notifGranted == null ? "—" : notifGranted ? tr("settings.granted") : tr("settings.fix")}
            chevron={notifGranted === false}
            onPress={notifGranted === false ? () => Linking.openSettings().catch(() => {}) : undefined}
          />
          <ListRow title={tr("settings.open_settings")} chevron onPress={() => Linking.openSettings().catch(() => {})} />
        </ListGroup>

        <ListGroup header={tr("settings.device")}>
          <ListRow title="Model" detail={Device.modelName || "unknown"} />
          <ListRow title="OS" detail={`${Platform.OS} ${Platform.Version}`} />
          <ListRow title="App" detail="1.0.0" />
        </ListGroup>

        <TouchableOpacity style={styles.signout} activeOpacity={0.8} onPress={handleSignOut}>
          <LogOut size={18} color={c.red} />
          <Text style={[t.headline, { color: c.red }]}>{tr("settings.sign_out")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <PermissionRationale
        visible={showRationale}
        onComplete={(granted) => {
          setShowRationale(false);
          void checkPermissions();
          if (granted && pendingOnline.current) void applyAvailability("ONLINE");
          pendingOnline.current = false;
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  identity: { alignItems: "center" },
  avatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: c.tint,
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  signout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm,
    marginTop: space.xl, height: 50, backgroundColor: c.redFill, borderRadius: radius.button, ...continuous,
  },
  shiftBlock: { marginTop: space.xl },
  availability: { flexDirection: "row", gap: space.sm },
  availabilityBtn: {
    flex: 1, height: 52, borderRadius: radius.button, alignItems: "center", justifyContent: "center",
    backgroundColor: c.tertiaryFill, borderWidth: 1, borderColor: c.hairline, ...continuous,
  },
});
