import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Platform } from "react-native";
import { useRouter } from "expo-router";
import { LogOut, ShieldCheck, ShieldAlert } from "lucide-react-native";
import { mockProfile } from "../src/mockData";
import { NavBar, ListGroup, ListRow, Screen } from "../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../src/theme";

const DOC_OK = new Set(["VALID", "ACTIVE"]);

export default function ProfileScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [profile, setProfile] = useState(mockProfile);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setProfile(mockProfile); }, []);
  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 400); };

  const handleLogout = useCallback(() => {
    Alert.alert("Sign out", "You'll need your enrollment code to sign back in. GPS tracking will stop.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive",
        onPress: async () => {
          if (Platform.OS !== "web") {
            try { const { stopBeacon } = await import("../src/services/locationService"); await stopBeacon(); } catch { /* not running */ }
            try { const { unenroll } = await import("../src/api/client"); await unenroll(); } catch { /* nothing to clear */ }
          }
          router.replace("/enrollment");
        },
      },
    ]);
  }, [router]);

  const initials = profile.name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  return (
    <Screen>
      <NavBar title="Profile" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={[t.title1, { color: c.white, fontWeight: "700" }]}>{initials}</Text></View>
          <Text style={[t.title2, { marginTop: space.md }]}>{profile.name}</Text>
          <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 2 }]}>
            {[profile.platform, profile.phone].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.statusPill}>
            <Text style={[t.caption1, { color: c.tint, fontWeight: "700" }]}>{profile.status}</Text>
          </View>
        </View>

        <ListGroup header="Assignment">
          <ListRow title="Company" detail={profile.company} />
          <ListRow title="Supervisor" detail={profile.supervisor} />
          <ListRow title="Zone" detail={profile.zone} />
          <ListRow title="Batch" detail={profile.batchNumber} />
        </ListGroup>

        <ListGroup header="Vehicle">
          <ListRow title="Type" detail={profile.vehicleType} />
          <ListRow title="Vehicle" detail={profile.vehicleLabel} />
          <ListRow title="Plate" detail={profile.vehiclePlate} />
          <ListRow title="SIM" detail={profile.simNumber} />
        </ListGroup>

        <ListGroup header="Documents">
          <DocRow label="Civil ID" status={profile.civilIdStatus} />
          <DocRow label="Driving licence" status={profile.drivingLicenseStatus} />
          <DocRow label="Health certificate" status={profile.healthCertStatus} />
        </ListGroup>

        <ListGroup header="Device">
          <ListRow title="Model" detail={profile.device?.model} />
          <ListRow title="OS" detail={profile.device?.osVersion} />
        </ListGroup>

        <TouchableOpacity style={styles.signout} activeOpacity={0.8} onPress={handleLogout}>
          <LogOut size={18} color={c.red} />
          <Text style={[t.headline, { color: c.red }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

function DocRow({ label, status }: { label: string; status?: string | null }) {
  const { c, t } = useTheme();
  const ok = status ? DOC_OK.has(status.toUpperCase()) : false;
  return (
    <ListRow
      title={label}
      trailing={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {status ? (ok ? <ShieldCheck size={16} color={c.tint} /> : <ShieldAlert size={16} color={c.orange} />) : null}
          <Text style={[t.body, { color: ok ? c.secondaryLabel : c.orange }]}>{status || "—"}</Text>
        </View>
      }
    />
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  identity: { alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: c.tint, alignItems: "center", justifyContent: "center", ...shadow.card },
  statusPill: { marginTop: space.md, backgroundColor: c.tintFill, borderRadius: radius.capsule, paddingHorizontal: 12, paddingVertical: 5 },
  signout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm,
    marginTop: space.xl, height: 50, backgroundColor: c.redFill, borderRadius: radius.button, ...continuous,
  },
});
