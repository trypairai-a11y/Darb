import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, LogOut, ShieldCheck, ShieldAlert } from "lucide-react-native";
import { unenroll } from "../src/api/client";
import { stopBeacon } from "../src/services/locationService";
import { mockProfile } from "../src/mockData";

interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  platform: string;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  vehicleLabel?: string | null;
  status: string;
  company?: string | null;
  supervisor?: string | null;
  zone?: string | null;
  batchNumber?: string | null;
  hireDate?: string | null;
  civilIdStatus?: string | null;
  drivingLicenseStatus?: string | null;
  healthCertStatus?: string | null;
  simNumber?: string | null;
  device?: { model?: string | null; osVersion?: string | null };
  score?: number | null;
}

const DOC_OK = new Set(["VALID", "ACTIVE"]);

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setProfile(mockProfile as DriverProfile);
    } catch (e: any) {
      setError(e.message ?? "Failed to load profile");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleLogout = useCallback(() => {
    Alert.alert(
      "Sign out",
      "You'll need your enrollment code to sign back in. GPS tracking will stop.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            try { await stopBeacon(); } catch { /* beacon may not be running */ }
            await unenroll();
            router.replace("/enrollment");
          },
        },
      ]
    );
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#1d1d1f" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#007A3D" /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.error}>{error}</Text></View>
      ) : profile ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007A3D" />}
        >
          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(profile.name)}</Text>
            </View>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.subline}>
              {[profile.platform, profile.phone].filter(Boolean).join(" · ")}
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{profile.status}</Text>
            </View>
          </View>

          <Section title="Assignment">
            <Field label="Company" value={profile.company} />
            <Field label="Supervisor" value={profile.supervisor} />
            <Field label="Zone" value={profile.zone} />
            <Field label="Batch" value={profile.batchNumber} />
          </Section>

          <Section title="Vehicle">
            <Field label="Type" value={profile.vehicleType} />
            <Field label="Vehicle" value={profile.vehicleLabel} />
            <Field label="Plate" value={profile.vehiclePlate} />
            <Field label="SIM" value={profile.simNumber} />
          </Section>

          <Section title="Documents">
            <DocField label="Civil ID" status={profile.civilIdStatus} />
            <DocField label="Driving licence" status={profile.drivingLicenseStatus} />
            <DocField label="Health certificate" status={profile.healthCertStatus} />
          </Section>

          {profile.device ? (
            <Section title="Device">
              <Field label="Model" value={profile.device.model} />
              <Field label="OS" value={profile.device.osVersion} />
            </Section>
          ) : null}

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <LogOut size={18} color="#D92D20" />
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "—"}</Text>
    </View>
  );
}

function DocField({ label, status }: { label: string; status?: string | null }) {
  const ok = status ? DOC_OK.has(status.toUpperCase()) : false;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.docStatus}>
        {status ? (
          ok ? <ShieldCheck size={16} color="#007A3D" /> : <ShieldAlert size={16} color="#D97706" />
        ) : null}
        <Text style={[styles.fieldValue, status && !ok ? styles.docWarn : null]}>
          {status || "—"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f7" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff", borderBottomColor: "#e5e5ea", borderBottomWidth: 1,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#1d1d1f" },
  content: { padding: 20, paddingBottom: 40 },
  identityCard: { alignItems: "center", marginBottom: 8 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#007A3D",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", color: "#1d1d1f" },
  subline: { fontSize: 14, color: "#6e6e73", marginTop: 4 },
  statusPill: { marginTop: 10, backgroundColor: "#E5F7ED", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: "700", color: "#007A3D" },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#6e6e73", textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#e5e5ea", overflow: "hidden" },
  fieldRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f2f2f7", gap: 16,
  },
  fieldLabel: { fontSize: 14, color: "#6e6e73" },
  fieldValue: { fontSize: 14, color: "#1d1d1f", fontWeight: "600", flexShrink: 1, textAlign: "right" },
  docStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  docWarn: { color: "#D97706" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 32, backgroundColor: "#FEF2F2", borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: "#FECACA",
  },
  logoutText: { color: "#D92D20", fontSize: 16, fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { color: "#B91C1C", fontSize: 14, paddingHorizontal: 24, textAlign: "center" },
});
