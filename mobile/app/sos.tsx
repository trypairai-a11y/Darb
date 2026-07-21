import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Camera as CameraIcon, Car, CircleCheck, Construction, Phone, ShieldAlert, Siren, X } from "lucide-react-native";
import { getIncident, postIncident, type IncidentCategory } from "../src/api/client";
import { Button, NavBar, Screen } from "../src/components/hig";
import { t as tr } from "../src/i18n/strings";
import { enqueueEvent, flushEventOutbox } from "../src/services/eventOutbox";
import { pickWebPhoto } from "../src/utils/webImagePicker";
import { useDriverStore } from "../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../src/theme";

const CATEGORIES: { value: IncidentCategory; icon: any }[] = [
  { value: "ACCIDENT", icon: Siren },
  { value: "BREAKDOWN", icon: Car },
  { value: "CUSTOMER_AGGRESSION", icon: ShieldAlert },
  { value: "ROAD_BLOCKAGE", icon: Construction },
];

type Phase = "compose" | "sending" | "sent" | "queued";

export default function SosScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const activeOrder = useDriverStore((s) => s.activeOrder);
  const supervisorPhone = useDriverStore((s) => s.supervisorPhone);

  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const [acked, setAcked] = useState(false);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // 10s status poll after a successful submit → "Supervisor has seen your report".
  useEffect(() => {
    if (phase !== "sent" || !incidentId || acked) return;
    const id = setInterval(async () => {
      try {
        const incident = await getIncident(incidentId);
        if (incident.status === "ACKNOWLEDGED" || incident.status === "RESOLVED") {
          setAcked(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      } catch {
        /* keep polling */
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [phase, incidentId, acked]);

  const addPhoto = useCallback(async () => {
    if (photos.length >= 3) return;
    // Web: native camera via file input (capture="environment"); no CameraView.
    if (Platform.OS === "web") {
      pickWebPhoto((uri) => {
        if (uri) setPhotos((prev) => (prev.length >= 3 ? prev : [...prev, uri]));
      });
      return;
    }
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) return;
    }
    setCameraOpen(true);
  }, [photos.length, cameraPermission, requestCameraPermission]);

  const takePicture = useCallback(async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        // Compress like photoService: ≤1280w JPEG q0.7 keeps ~200KB per shot.
        const compressed = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
        );
        setPhotos((prev) => (prev.length >= 3 ? prev : [...prev, compressed.uri]));
      }
    } catch {}
    setCameraOpen(false);
  }, []);

  const submit = useCallback(async () => {
    if (!category || phase !== "compose") return;
    setPhase("sending");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    // Auto-attach the freshest possible GPS fix.
    let coords: { lat: number; lng: number } | undefined;
    try {
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      coords = { lat: cur.coords.latitude, lng: cur.coords.longitude };
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) coords = { lat: last.coords.latitude, lng: last.coords.longitude };
      } catch {}
    }

    try {
      const incident = await postIncident({
        category,
        description: description.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        orderId: activeOrder?.id,
        photos: photos.map((uri) => ({ uri })),
      });
      setIncidentId(incident.id);
      setPhase("sent");
    } catch {
      // Offline: queue the report durably and tell the courier to CALL now.
      await enqueueEvent("INCIDENT", `incident:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, {
        category,
        description: description.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        orderId: activeOrder?.id,
        photoUris: photos,
      });
      flushEventOutbox().catch(() => {});
      setPhase("queued");
    }
  }, [category, phase, description, photos, activeOrder?.id]);

  // ─── Full-screen camera ───
  if (cameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={styles.shutterRow}>
          <TouchableOpacity style={styles.cancelShutter} onPress={() => setCameraOpen(false)}>
            <Text style={[t.subheadline, { color: c.white }]}>{tr("common.cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shutter} onPress={() => void takePicture()} accessibilityLabel="Capture" />
          <View style={{ width: 76 }} />
        </View>
      </View>
    );
  }

  // ─── Sent / queued confirmation ───
  if (phase === "sent" || phase === "queued") {
    const queued = phase === "queued";
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <View style={[styles.doneBadge, queued && { backgroundColor: c.orange }]}>
            <CircleCheck size={44} color={queued ? c.systemBackground : c.onTint} strokeWidth={2.4} />
          </View>
          <Text style={[t.title1, { marginTop: space.lg, textAlign: "center" }]}>
            {queued ? tr("sos.queued_title") : acked ? tr("sos.acked") : tr("sos.sent_title")}
          </Text>
          <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 6, textAlign: "center" }]}>
            {queued ? tr("sos.queued_body") : tr("sos.sent_body")}
          </Text>
          {!queued && !acked ? <ActivityIndicator size="small" color={c.tint} style={{ marginTop: space.lg }} /> : null}

          {supervisorPhone ? (
            <TouchableOpacity
              style={styles.callBtn}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(`tel:${supervisorPhone}`).catch(() => {})}
            >
              <Phone size={18} color={c.onTint} />
              <Text style={[t.headline, { color: c.onTint }]}>{tr("common.call_supervisor")}</Text>
            </TouchableOpacity>
          ) : null}
          <Button title={tr("common.back")} variant="tinted" style={{ marginTop: space.md, alignSelf: "stretch" }}
            onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavBar title={tr("sos.title")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{tr("sos.subtitle")}</Text>

        {/* ─── Category grid ─── */}
        <View style={styles.grid}>
          {CATEGORIES.map(({ value, icon: Icon }) => {
            const active = category === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.cat, active && { borderColor: c.red, backgroundColor: c.redFill }]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCategory(value)}
              >
                <Icon size={28} color={active ? c.red : c.secondaryLabel} />
                <Text
                  style={[t.subheadline, {
                    marginTop: space.sm, textAlign: "center",
                    color: active ? c.red : c.label,
                    fontFamily: undefined, fontWeight: active ? "700" : "500",
                  }]}
                  numberOfLines={2}
                >
                  {tr(`sos.cat.${value}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Photos (optional, ≤3) ─── */}
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={uri} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <TouchableOpacity
                style={styles.thumbRemove}
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                accessibilityLabel="Remove photo"
              >
                <X size={12} color={c.white} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 3 ? (
            <TouchableOpacity style={styles.addPhoto} activeOpacity={0.8} onPress={() => void addPhoto()}>
              <CameraIcon size={20} color={c.tint} />
              <Text style={[t.caption1, { color: c.tint, marginTop: 4 }]}>
                {tr("sos.add_photos", { count: photos.length })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TextInput
          style={styles.note}
          placeholder={tr("sos.describe")}
          placeholderTextColor={c.placeholder}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Button
          title={phase === "sending" ? tr("sos.sending") : tr("sos.send")}
          variant="destructive"
          onPress={() => void submit()}
          disabled={!category || phase !== "compose"}
          style={{ marginTop: space.xl, height: 58 }}
        />

        {supervisorPhone ? (
          <TouchableOpacity
            style={styles.callLink}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(`tel:${supervisorPhone}`).catch(() => {})}
          >
            <Phone size={15} color={c.secondaryLabel} />
            <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{tr("common.call_supervisor")}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.lg },
  cat: {
    width: "47.6%", flexGrow: 1, minHeight: 110, borderRadius: radius.card,
    backgroundColor: c.groupedSecondary, borderWidth: 2, borderColor: c.hairline,
    alignItems: "center", justifyContent: "center", padding: space.md, ...continuous,
  },
  photoRow: { flexDirection: "row", gap: space.sm, marginTop: space.lg, alignItems: "center" },
  thumbWrap: { position: "relative" },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.gray6 },
  thumbRemove: {
    position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: c.red, alignItems: "center", justifyContent: "center",
  },
  addPhoto: {
    width: 72, height: 72, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: "dashed",
    borderColor: c.gray4, alignItems: "center", justifyContent: "center",
  },
  note: {
    fontSize: 15, color: c.label, backgroundColor: c.groupedSecondary,
    borderRadius: radius.field, borderWidth: 1, borderColor: c.hairline,
    padding: space.base, minHeight: 80, textAlignVertical: "top", marginTop: space.lg, ...continuous,
  },
  callLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: space.lg, padding: space.sm },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  doneBadge: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: c.tint,
    alignItems: "center", justifyContent: "center", ...shadow.glow,
  },
  callBtn: {
    marginTop: space.xl, alignSelf: "stretch", height: 56, borderRadius: radius.button, backgroundColor: c.tint,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, ...continuous, ...shadow.glow,
  },
  shutterRow: {
    position: "absolute", bottom: 40, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xl,
  },
  cancelShutter: { width: 76, paddingVertical: 12 },
  shutter: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: "#FFFFFF",
    borderWidth: 5, borderColor: "rgba(255,255,255,0.4)",
  },
});
