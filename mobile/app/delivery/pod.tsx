import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Camera as CameraIcon, Check, CircleCheck } from "lucide-react-native";
import { isApiError, postPod } from "../../src/api/client";
import { Button, NavBar, Screen, Segmented } from "../../src/components/hig";
import { formatKwd } from "../../src/i18n/format";
import { t as tr } from "../../src/i18n/strings";
import { enqueueEvent, flushEventOutbox } from "../../src/services/eventOutbox";
import { uploadDeliveryPhoto } from "../../src/services/photoService";
import { hydrateNow } from "../../src/services/offerChannel";
import { useDriverStore } from "../../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../../src/theme";

type PodMethod = "PIN" | "PHOTO";
type DoneState = null | "delivered" | "queued";

async function podCoords(): Promise<{ lat: number; lng: number }> {
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

export default function PodScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const order = useDriverStore((s) => s.activeOrder);
  const online = useDriverStore((s) => s.online);
  const setWallet = useDriverStore((s) => s.setWallet);
  const completeOrder = useDriverStore((s) => s.completeOrder);

  const codAmount = Number(order?.codAmountKwd ?? 0);
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [method, setMethod] = useState<PodMethod>(online ? "PIN" : "PHOTO");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMisses, setPinMisses] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<DoneState>(null);
  const cameraRef = useRef<CameraView>(null);
  const pinInputRef = useRef<TextInput>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const pinLocked = pinMisses >= 3;
  const pinAvailable = online && !pinLocked;
  const codGateOpen = codAmount <= 0 || codConfirmed;

  const finish = useCallback(
    (state: Exclude<DoneState, null>) => {
      setDone(state);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      completeOrder();
      setTimeout(() => {
        void hydrateNow();
        router.replace("/(tabs)/home");
      }, 1400);
    },
    [completeOrder, router],
  );

  const submitPin = useCallback(async () => {
    if (!order || pin.length !== 4 || submitting || !codGateOpen || !pinAvailable) return;
    setSubmitting(true);
    setPinError(null);
    try {
      const coords = await podCoords();
      const res = await postPod(order.id, {
        method: "PIN",
        pin,
        codCollectedKwd: codAmount > 0 ? codAmount : undefined,
        lat: coords.lat,
        lng: coords.lng,
        idempotencyKey: `pod:${order.id}`,
      });
      if (res?.wallet) setWallet(res.wallet);
      finish("delivered");
    } catch (e: any) {
      if (isApiError(e, 422)) {
        const attemptsLeft = typeof e.body?.attemptsLeft === "number" ? e.body.attemptsLeft : Math.max(0, 2 - pinMisses);
        const misses = attemptsLeft > 0 ? 3 - attemptsLeft : 3;
        setPinMisses(misses);
        setPin("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        if (misses >= 3 || attemptsLeft <= 0) {
          setPinMisses(3);
          setMethod("PHOTO"); // server forces photo-only after 3 misses
          setPinError(tr("pod.pin_locked"));
        } else {
          setPinError(tr("pod.pin_mismatch", { attemptsLeft }));
        }
      } else if (isApiError(e, 409)) {
        // Already delivered / state moved on — adopt the server's truth.
        await hydrateNow();
        finish("delivered");
      } else if (isApiError(e)) {
        setPinError(e.message);
      } else {
        // Network down: PIN can't be verified offline — steer to photo.
        setMethod("PHOTO");
        setPinError(tr("pod.pin_offline"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [order, pin, submitting, codGateOpen, pinAvailable, codAmount, pinMisses, setWallet, finish]);

  const capturePhoto = useCallback(async () => {
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

  const submitPhoto = useCallback(async () => {
    if (!order || !photoUri || submitting || !codGateOpen) return;
    setSubmitting(true);
    try {
      const coords = await podCoords();
      try {
        // Online path: presign → PUT → /pod in one go.
        const { key } = await uploadDeliveryPhoto({
          orderId: order.id,
          uri: photoUri,
          latitude: coords.lat,
          longitude: coords.lng,
        });
        const res = await postPod(order.id, {
          method: "PHOTO",
          photoKey: key,
          codCollectedKwd: codAmount > 0 ? codAmount : undefined,
          lat: coords.lat,
          lng: coords.lng,
          idempotencyKey: `pod:${order.id}`,
        });
        if (res?.wallet) setWallet(res.wallet);
        finish("delivered");
      } catch (e) {
        if (isApiError(e, 409)) {
          await hydrateNow();
          finish("delivered");
          return;
        }
        // Offline (or upload failed): persist the photo durably — the cache
        // dir can be purged before we get signal again — and queue a POD row.
        // The outbox flush replays presign → PUT → /pod until it lands.
        let durableUri = photoUri;
        try {
          const dir = `${FileSystem.documentDirectory}pod/`;
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
          durableUri = `${dir}${order.id}.jpg`;
          await FileSystem.copyAsync({ from: photoUri, to: durableUri });
        } catch {
          durableUri = photoUri;
        }
        await enqueueEvent("POD", `pod:${order.id}`, {
          orderId: order.id,
          method: "PHOTO",
          photoUri: durableUri,
          codCollectedKwd: codAmount > 0 ? codAmount : undefined,
          lat: coords.lat,
          lng: coords.lng,
        });
        flushEventOutbox().catch(() => {});
        finish("queued");
      }
    } finally {
      setSubmitting(false);
    }
  }, [order, photoUri, submitting, codGateOpen, codAmount, setWallet, finish]);

  if (!order && !done) {
    return <Redirect href="/(tabs)/home" />;
  }

  // ─── Delivered overlay ───
  if (done) {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <View style={styles.doneBadge}>
            <Check size={44} color={c.onTint} strokeWidth={3} />
          </View>
          <Text style={[t.title1, { marginTop: space.lg }]}>{tr("pod.delivered")}</Text>
          {done === "queued" ? (
            <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 6, textAlign: "center" }]}>
              {tr("pod.delivered_queued")}
            </Text>
          ) : null}
        </View>
      </Screen>
    );
  }

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

  return (
    <Screen>
      <NavBar title={tr("pod.title")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* ─── COD gate (leads) ─── */}
        {codAmount > 0 ? (
          <View style={[styles.codCard, codConfirmed && { borderColor: "rgba(198,255,58,0.4)", backgroundColor: c.tintFill }]}>
            <Text style={[t.caption1, { color: codConfirmed ? c.tint : c.warnLabel2, textTransform: "uppercase", letterSpacing: 1 }]}>
              {tr("delivery.cod_title")}
            </Text>
            <Text style={[t.title1, { color: codConfirmed ? c.tint : c.warnLabel, marginTop: 4 }]}>
              {tr("pod.collect", { amount: formatKwd(codAmount) })}
            </Text>
            <View style={styles.codConfirmRow}>
              <Text style={[t.subheadline, { color: c.label, flex: 1 }]}>{tr("pod.collect_confirm")}</Text>
              <Switch
                value={codConfirmed}
                onValueChange={(v) => {
                  setCodConfirmed(v);
                  if (v) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                }}
                trackColor={{ true: c.tint, false: c.gray4 }}
                thumbColor={c.white}
              />
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: space.lg, opacity: codGateOpen ? 1 : 0.35 }} pointerEvents={codGateOpen ? "auto" : "none"}>
          <Segmented<PodMethod>
            options={[
              { value: "PIN", label: tr("pod.method_pin") },
              { value: "PHOTO", label: tr("pod.method_photo") },
            ]}
            value={method}
            onChange={(v) => {
              if (v === "PIN" && !pinAvailable) return;
              setMethod(v);
            }}
          />

          {method === "PIN" ? (
            <View style={{ marginTop: space.xl }}>
              <Text style={[t.subheadline, { color: c.secondaryLabel, textAlign: "center" }]}>
                {pinAvailable ? tr("pod.pin_hint") : pinLocked ? tr("pod.pin_locked") : tr("pod.pin_offline")}
              </Text>
              <TouchableOpacity
                style={styles.pinRow}
                activeOpacity={0.9}
                onPress={() => pinInputRef.current?.focus()}
                disabled={!pinAvailable}
              >
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.pinBox, pin.length === i && pinAvailable && { borderColor: c.tint }]}>
                    <Text style={[t.hero, { fontSize: 34, lineHeight: 40 }]}>{pin[i] ?? ""}</Text>
                  </View>
                ))}
              </TouchableOpacity>
              <TextInput
                ref={pinInputRef}
                style={styles.hiddenInput}
                value={pin}
                onChangeText={(v) => {
                  setPinError(null);
                  setPin(v.replace(/\D/g, "").slice(0, 4));
                }}
                keyboardType="number-pad"
                maxLength={4}
                editable={pinAvailable && !submitting}
                autoFocus={pinAvailable}
              />
              {pinError ? (
                <Text style={[t.footnote, { color: c.red, textAlign: "center", marginTop: space.sm }]}>{pinError}</Text>
              ) : null}
              <Button
                title={submitting ? tr("pod.submitting") : tr("pod.confirm_delivery")}
                onPress={() => void submitPin()}
                disabled={pin.length !== 4 || submitting || !pinAvailable || !codGateOpen}
                style={{ marginTop: space.xl }}
              />
            </View>
          ) : (
            <View style={{ marginTop: space.xl }}>
              <Text style={[t.subheadline, { color: c.secondaryLabel, textAlign: "center" }]}>
                {tr("pod.photo_hint")}
              </Text>
              {photoUri ? (
                <View style={{ marginTop: space.lg }}>
                  <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
                  <TouchableOpacity style={styles.retake} activeOpacity={0.7} onPress={() => void capturePhoto()}>
                    <Text style={[t.subheadline, { color: c.tint, fontFamily: undefined, fontWeight: "700" }]}>
                      {tr("pod.retake")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.captureCard} activeOpacity={0.8} onPress={() => void capturePhoto()}>
                  <CameraIcon size={32} color={c.tint} />
                  <Text style={[t.headline, { color: c.tint, marginTop: space.sm }]}>{tr("pod.take_photo")}</Text>
                </TouchableOpacity>
              )}
              {!online ? (
                <View style={styles.offlineNote}>
                  <CircleCheck size={14} color={c.warnLabel2} />
                  <Text style={[t.footnote, { color: c.warnLabel2, flex: 1 }]}>{tr("pod.delivered_queued")}</Text>
                </View>
              ) : null}
              <Button
                title={submitting ? tr("pod.submitting") : tr("pod.confirm_delivery")}
                onPress={() => void submitPhoto()}
                disabled={!photoUri || submitting || !codGateOpen}
                style={{ marginTop: space.xl }}
              />
            </View>
          )}
        </View>

        {submitting ? <ActivityIndicator size="small" color={c.tint} style={{ marginTop: space.lg }} /> : null}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  codCard: {
    backgroundColor: c.warnBg, borderRadius: radius.card, padding: space.base,
    borderWidth: 1, borderColor: "rgba(255,184,77,0.22)", ...continuous,
  },
  codConfirmRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md },
  pinRow: { flexDirection: "row", justifyContent: "center", gap: space.md, marginTop: space.lg },
  pinBox: {
    width: 62, height: 74, borderRadius: radius.field, borderWidth: 2, borderColor: c.gray4,
    backgroundColor: c.groupedSecondary, alignItems: "center", justifyContent: "center", ...continuous,
  },
  hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 },
  captureCard: {
    marginTop: space.lg, height: 180, borderRadius: radius.card, borderWidth: 2, borderStyle: "dashed",
    borderColor: c.gray4, backgroundColor: c.groupedSecondary, alignItems: "center", justifyContent: "center", ...continuous,
  },
  preview: { width: "100%", height: 260, borderRadius: radius.card, backgroundColor: c.gray6, ...continuous },
  retake: { alignSelf: "center", marginTop: space.md, padding: space.sm },
  offlineNote: {
    flexDirection: "row", alignItems: "center", gap: 7, marginTop: space.md,
    backgroundColor: c.warnBg, borderRadius: radius.field, padding: space.md, ...continuous,
  },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  doneBadge: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: c.tint,
    alignItems: "center", justifyContent: "center", ...shadow.glow,
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
