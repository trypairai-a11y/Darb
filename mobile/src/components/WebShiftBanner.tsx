/**
 * WebShiftBanner — web-only shift-tracking advisory.
 *
 * A browser tab cannot track GPS in the background: the moment the tab is
 * hidden (or the browser is closed) the watchPosition stream stops. Drivers
 * must keep the tab open and visible while on shift. This banner:
 *
 *   - renders NOTHING on native (and nothing while OFFLINE on web)
 *   - warns persistently while ONLINE/BUSY: "keep this tab open"
 *   - switches to a stronger warning when browser location permission is
 *     denied or geolocation is unavailable
 *
 * Status comes from webLocationService's tiny observable, so the banner reacts
 * instantly to a denial without polling.
 */

import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { MapPinOff, TriangleAlert } from "lucide-react-native";
import { t as tr } from "../i18n/strings";
import { useDriverStore } from "../store/driverStore";
import { useTheme, type Palette, space, radius, continuous } from "../theme";
import {
  getWebGpsStatus,
  subscribeWebGpsStatus,
  type WebGpsStatus,
} from "../services/webLocationService";

export function WebShiftBanner() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const availability = useDriverStore((s) => s.availability);
  const [status, setStatus] = useState<WebGpsStatus>(() =>
    Platform.OS === "web" ? getWebGpsStatus() : "idle",
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    return subscribeWebGpsStatus(setStatus);
  }, []);

  if (Platform.OS !== "web") return null;
  if (availability === "OFFLINE") return null;

  const blocked = status === "denied" || status === "unavailable";
  const Icon = blocked ? MapPinOff : TriangleAlert;
  const text = blocked ? tr("web.location_denied") : tr("web.keep_tab_open");

  return (
    <View style={[styles.banner, blocked && styles.bannerBlocked]}>
      <Icon size={16} color={blocked ? c.red : c.warnLabel} />
      <Text
        style={[
          t.footnote,
          { color: blocked ? c.red : c.warnLabel, flex: 1 },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      backgroundColor: c.warnBg,
      borderRadius: radius.field,
      borderWidth: 1,
      borderColor: "rgba(255,184,77,0.22)",
      paddingHorizontal: space.md,
      paddingVertical: 10,
      marginBottom: space.md,
      ...continuous,
    },
    bannerBlocked: {
      backgroundColor: c.redFill,
      borderColor: "rgba(255,90,90,0.3)",
    },
  });
