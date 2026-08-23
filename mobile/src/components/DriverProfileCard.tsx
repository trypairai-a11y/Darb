/**
 * DriverProfileCard — the driver's own details, one tap from Home.
 *
 * Client request, 2026-08-06: "the profile please put it in the home tab with a
 * small button that the driver can press and see his darb id, phone number,
 * name, and darb points".
 *
 * Four facts and nothing else. The Darb ID is first because it is the one a
 * driver is asked for and cannot remember: it is what they enrolled with, what
 * a supervisor looks them up by, and what finance searches remittances on.
 *
 * The score is read from /api/agent/points, the same endpoint the full Darb
 * Points screen uses, and only when the card is opened. It is deliberately not
 * part of the /state poll: a number nobody is looking at does not need to ride
 * along with every hydrate.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Award, X } from "lucide-react-native";
import { fetchMyDarbPoints } from "../api/client";
import { t as tr } from "../i18n/strings";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../theme";

export interface DriverProfileCardProps {
  visible: boolean;
  onClose: () => void;
  driver: { id: string; driverCode?: string | null; name?: string; phone?: string | null } | null;
}

export function DriverProfileCard({ visible, onClose, driver }: DriverProfileCardProps) {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = makeStyles(c);

  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMyDarbPoints();
      setScore(res.current?.totalScore ?? null);
    } catch {
      // A points call that fails leaves the row reading "n/a" rather than
      // taking the card down with it: the other three facts are held locally
      // and are the reason the driver opened it.
      setScore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const initials =
    (driver?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="driver-profile-card">
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel={tr("common.cancel")}>
            <X size={18} color={c.secondaryLabel} />
          </TouchableOpacity>

          <View style={styles.avatar}>
            <Text style={[t.title1, { color: c.onTint, fontWeight: "700" }]}>{initials}</Text>
          </View>
          <Text style={[t.title2, { marginTop: space.md }]}>{driver?.name || "Driver"}</Text>

          <View style={styles.rows}>
            <View style={styles.row}>
              <Text style={[t.footnote, { color: c.secondaryLabel }]}>{tr("profile.darb_id")}</Text>
              <Text style={[t.headline, { color: c.label }]}>{driver?.driverCode || "n/a"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[t.footnote, { color: c.secondaryLabel }]}>{tr("profile.phone")}</Text>
              <Text style={[t.headline, { color: c.label }]}>{driver?.phone || "n/a"}</Text>
            </View>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={[t.footnote, { color: c.secondaryLabel }]}>{tr("profile.points")}</Text>
              {loading ? (
                <ActivityIndicator color={c.tint} />
              ) : (
                <Text style={[t.headline, { color: c.label }]}>
                  {score === null ? "n/a" : String(Math.round(score * 10) / 10)}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.pointsLink}
            activeOpacity={0.8}
            testID="driver-profile-points"
            onPress={() => {
              onClose();
              router.push("/points");
            }}
          >
            <Award size={16} color={c.onTint} />
            <Text style={[t.headline, { color: c.onTint }]}>{tr("settings.my_points")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
    padding: space.base,
  },
  card: {
    width: "100%", maxWidth: 380, backgroundColor: c.systemBackground, borderRadius: radius.card,
    padding: space.lg, alignItems: "center", ...continuous, ...shadow.card,
  },
  close: { position: "absolute", top: space.md, right: space.md, padding: space.xs, zIndex: 1 },
  avatar: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: c.tint,
    alignItems: "center", justifyContent: "center",
  },
  rows: { alignSelf: "stretch", marginTop: space.lg },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator,
  },
  pointsLink: {
    alignSelf: "stretch", marginTop: space.lg, height: 46, borderRadius: radius.button,
    backgroundColor: c.tint, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: space.sm, ...continuous,
  },
});
