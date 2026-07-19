import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Bell, LogOut, MapPin } from "lucide-react-native";
import { ListGroup, ListRow, NavBar, Screen } from "../src/components/hig";
import { t as tr } from "../src/i18n/strings";
import { PermissionRationale } from "../src/components/PermissionRationale";
import { stopOfferChannel } from "../src/services/offerChannel";
import { useDriverStore } from "../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const driver = useDriverStore((s) => s.driver);
  const reset = useDriverStore((s) => s.reset);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [showRationale, setShowRationale] = useState(false);

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

  const handleSignOut = useCallback(() => {
    Alert.alert(tr("settings.sign_out_title"), tr("settings.sign_out_body"), [
      { text: tr("common.cancel"), style: "cancel" },
      {
        text: tr("settings.sign_out"),
        style: "destructive",
        onPress: async () => {
          stopOfferChannel();
          if (Platform.OS !== "web") {
            try { const { stopBeacon } = await import("../src/services/locationService"); await stopBeacon(); } catch {}
          }
          try { const { unenroll } = await import("../src/api/client"); await unenroll(); } catch {}
          reset();
          router.replace("/enrollment");
        },
      },
    ]);
  }, [reset, router]);

  const initials =
    (driver?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  return (
    <Screen>
      <NavBar title={tr("settings.title")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={[t.title1, { color: c.onTint, fontWeight: "700" }]}>{initials}</Text>
          </View>
          <Text style={[t.title2, { marginTop: space.md }]}>{driver?.name || "Driver"}</Text>
          {driver?.phone ? (
            <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2 }]}>{driver.phone}</Text>
          ) : null}
        </View>

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
        onComplete={() => {
          setShowRationale(false);
          void checkPermissions();
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
});
