/**
 * arrival.tsx — proof that the driver reached the restaurant.
 *
 * Client request, 2026-08-01: "when the driver presses arrived to restaurant,
 * must take a photo as proof". The step used to advance on a tap alone, which
 * made "At the restaurant" a claim rather than evidence, and a merchant
 * disputing a late collection had nothing to look at.
 *
 * Built as its own route rather than a sheet on the delivery screen, mirroring
 * delivery/pod.tsx: the same camera-on-native, file-input-on-web split, and the
 * same rule that the driver cannot leave without having taken the picture.
 *
 * Where it deliberately differs from POD: the photo is queued through the
 * outbox and the step advances as soon as it is captured, rather than waiting
 * for the upload. A driver standing in a basement loading bay with no signal
 * must not be blocked from working, and the proof still lands when the outbox
 * flushes. POD can afford to wait because it ends the job; this is the middle
 * of one.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Camera as CameraIcon, Store } from "lucide-react-native";
import { Button, NavBar, Screen } from "../../src/components/hig";
import { t as tr } from "../../src/i18n/strings";
import { enqueueEvent, flushEventOutbox, enqueueOrderStatus } from "../../src/services/eventOutbox";
import { pickWebPhoto } from "../../src/utils/webImagePicker";
import { useDriverStore } from "../../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";

async function coords(): Promise<{ lat: number; lng: number }> {
  try {
    const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: cur.coords.latitude, lng: cur.coords.longitude };
  } catch {}
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {}
  return { lat: 0, lng: 0 };
}

export default function ArrivalScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const order = useDriverStore((s) => s.activeOrder);
  const advanceOrder = useDriverStore((s) => s.advanceOrder);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const capturePhoto = useCallback(async () => {
    // Web: a file input with capture="environment" opens the phone browser's
    // own camera and degrades to a picker on desktop.
    if (Platform.OS === "web") {
      pickWebPhoto(setPhotoUri);
      return;
    }
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) return;
    }
    setCameraOpen(true);
  }, [cameraPermission, requestCameraPermission]);

  const takePicture = useCallback(async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setCameraOpen(false);
      }
    } catch {
      setCameraOpen(false);
    }
  }, []);

  const confirm = useCallback(async () => {
    if (!order || !photoUri || submitting) return;
    setSubmitting(true);
    try {
      const at = await coords();
      // Photo first, so a crash between the two leaves proof without a claim
      // rather than a claim with no proof.
      await enqueueEvent("ARRIVAL_PHOTO", `arrival:${order.id}`, {
        orderId: order.id,
        photoUri,
        lat: at.lat,
        lng: at.lng,
      });
      await enqueueOrderStatus(order.id, "ARRIVED_AT_PICKUP", at);
      advanceOrder("ARRIVED_AT_PICKUP");
      flushEventOutbox().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } finally {
      setSubmitting(false);
    }
  }, [order, photoUri, submitting, advanceOrder, router]);

  if (!order) return <Redirect href="/(tabs)/home" />;

  if (cameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={styles.shutterBar}>
          <TouchableOpacity style={styles.shutter} activeOpacity={0.8} onPress={() => void takePicture()}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCameraOpen(false)} style={{ marginTop: space.base }}>
            <Text style={[t.subheadline, { color: "#fff" }]}>{tr("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <NavBar title={tr("arrival.title")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Store size={18} color={c.tint} />
          <Text style={[t.headline, { flex: 1 }]} numberOfLines={2}>
            {order.pickup?.name ?? tr("arrival.title")}
          </Text>
        </View>
        <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: space.sm }]}>
          {tr("arrival.hint")}
        </Text>

        {photoUri ? (
          <View style={{ marginTop: space.lg }}>
            <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
            <TouchableOpacity style={styles.retake} activeOpacity={0.7} onPress={() => void capturePhoto()}>
              <Text style={[t.subheadline, { color: c.tint, fontWeight: "700" }]}>
                {tr("pod.retake")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.captureCard}
            activeOpacity={0.8}
            testID="arrival-take-photo"
            onPress={() => void capturePhoto()}
          >
            <CameraIcon size={32} color={c.tint} />
            <Text style={[t.headline, { color: c.tint, marginTop: space.sm }]}>
              {tr("arrival.take_photo")}
            </Text>
          </TouchableOpacity>
        )}

        <Button
          title={tr("arrival.confirm")}
          onPress={() => void confirm()}
          disabled={!photoUri || submitting}
          style={{ marginTop: space.xl }}
        />
        {submitting ? <ActivityIndicator size="small" color={c.tint} style={{ marginTop: space.lg }} /> : null}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  captureCard: {
    marginTop: space.lg, alignItems: "center", justifyContent: "center",
    paddingVertical: space.xxl, borderRadius: radius.card,
    borderWidth: 2, borderColor: c.tint, borderStyle: "dashed",
    backgroundColor: c.groupedBackground, ...continuous,
  },
  preview: { width: "100%", height: 260, borderRadius: radius.card, ...continuous },
  retake: { alignSelf: "center", marginTop: space.md, padding: space.sm },
  shutterBar: { position: "absolute", bottom: 44, left: 0, right: 0, alignItems: "center" },
  shutter: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
});
