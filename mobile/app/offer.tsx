import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Banknote, MapPin, Navigation } from "lucide-react-native";
import { acceptOffer, isApiError, rejectOffer, type AgentOfferSummary } from "../src/api/client";
import { formatKwd } from "../src/i18n/format";
import { t as tr } from "../src/i18n/strings";
import { hydrateNow } from "../src/services/offerChannel";
import { useDriverStore } from "../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, shadow } from "../src/theme";

const RING_SIZE = 176;
const RING_STROKE = 10;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

type Phase = "live" | "accepting" | "expired";

export default function OfferScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const storeOffer = useDriverStore((s) => s.activeOffer);
  const clockSkewMs = useDriverStore((s) => s.clockSkewMs);
  const offerResolved = useDriverStore((s) => s.offerResolved);
  const adoptOrder = useDriverStore((s) => s.adoptOrder);

  // Snapshot the offer at presentation so the UI never blanks mid-animation
  // (e.g. a hydrate clears the store while we show the "expired" state).
  const offerRef = useRef<AgentOfferSummary | null>(storeOffer);
  if (storeOffer && offerRef.current?.id !== storeOffer.id) offerRef.current = storeOffer;
  const offer = offerRef.current;

  const [phase, setPhase] = useState<Phase>("live");
  const [remaining, setRemaining] = useState(() =>
    offer ? Math.max(0, Date.parse(offer.expiresAt) - (Date.now() + clockSkewMs)) : 0,
  );
  const totalRef = useRef(Math.max(remaining, 1));
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastBuzzSecond = useRef<number>(-1);
  const phaseRef = useRef<Phase>("live");
  phaseRef.current = phase;

  const dismiss = useCallback(() => {
    stopSound(soundRef);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  const expire = useCallback(() => {
    // Auto-expiry never calls reject — the server expires the offer itself.
    if (phaseRef.current === "expired") return;
    setPhase("expired");
    stopSound(soundRef);
    if (offer) offerResolved(offer.id);
    setTimeout(() => {
      void hydrateNow();
      dismiss();
    }, 1500);
  }, [offer, offerResolved, dismiss]);

  // Android back — a dispatch offer cannot be dismissed by accident.
  // Web: BackHandler is a react-native-web stub — skip it.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  // Alarm: looped sound (audible in silent mode) + arrival haptic.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          require("../assets/sounds/offer-alert.wav"),
          { isLooping: true, volume: 1.0 },
        );
        if (cancelled) {
          await sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        await sound.playAsync();
      } catch {
        /* sound is best-effort — the modal + haptics still work */
      }
    })();
    return () => {
      cancelled = true;
      stopSound(soundRef);
    };
  }, []);

  // 100ms countdown loop on the SERVER clock (expiresAt + skew).
  useEffect(() => {
    if (!offer) return;
    const id = setInterval(() => {
      const ms = Math.max(0, Date.parse(offer.expiresAt) - (Date.now() + clockSkewMs));
      setRemaining(ms);
      const sec = Math.ceil(ms / 1000);
      if (sec <= 5 && sec > 0 && sec !== lastBuzzSecond.current && phaseRef.current === "live") {
        lastBuzzSecond.current = sec;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
      if (ms <= 0 && phaseRef.current === "live") expire();
    }, 100);
    return () => clearInterval(id);
  }, [offer, clockSkewMs, expire]);

  const onAccept = useCallback(async () => {
    if (!offer || phase !== "live") return;
    setPhase("accepting");
    stopSound(soundRef);
    try {
      const res = await acceptOffer(offer.id);
      offerResolved(offer.id);
      if (res?.order) adoptOrder(res.order, res.serverTime);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/delivery");
    } catch (e) {
      if (isApiError(e, 409, 410)) {
        expire();
      } else {
        // Network blip — let the courier retry within the window.
        setPhase("live");
      }
    }
  }, [offer, phase, offerResolved, adoptOrder, router, expire]);

  const onReject = useCallback(async () => {
    if (!offer || phase !== "live") return;
    stopSound(soundRef);
    offerResolved(offer.id);
    rejectOffer(offer.id).catch(() => {});
    void hydrateNow();
    dismiss();
  }, [offer, phase, offerResolved, dismiss]);

  if (!offer) {
    // Deep-linked here with no offer in the store — nothing to show.
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={[t.title3, { color: c.secondaryLabel }]}>{tr("offer.expired")}</Text>
      </View>
    );
  }

  const secondsLeft = Math.ceil(remaining / 1000);
  const progress = Math.min(1, remaining / totalRef.current);
  const urgent = secondsLeft <= 5;
  const ringColor = phase === "expired" ? c.gray3 : urgent ? c.red : c.tint;
  const isCod = offer.paymentMethod === "COD" || Number(offer.codAmountKwd ?? 0) > 0;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[t.footnote, { color: c.tint, letterSpacing: 1.4, textTransform: "uppercase" }]}>
          {tr("offer.title")}
        </Text>
        <Text style={[t.title1, { marginTop: 6, textAlign: "center" }]} numberOfLines={2}>
          {offer.restaurantName}
        </Text>
        {offer.pickupArea ? (
          <View style={styles.metaRow}>
            <MapPin size={14} color={c.secondaryLabel} />
            <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{offer.pickupArea}</Text>
          </View>
        ) : null}
      </View>

      {/* ─── Countdown ring ─── */}
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
            stroke={c.gray5} strokeWidth={RING_STROKE} fill="none"
          />
          <Circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
            stroke={ringColor} strokeWidth={RING_STROKE} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_C}`}
            strokeDashoffset={RING_C * (1 - progress)}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          {phase === "expired" ? (
            <>
              <Text style={[t.title2, { color: c.secondaryLabel }]}>{tr("offer.expired")}</Text>
              <Text style={[t.footnote, { color: c.tertiaryLabel, marginTop: 2, textAlign: "center" }]}>
                {tr("offer.expired_sub")}
              </Text>
            </>
          ) : (
            <>
              <Text style={[t.hero, { color: urgent ? c.red : c.label }]}>{secondsLeft}</Text>
              <Text style={[t.caption1, { color: c.secondaryLabel }]}>seconds</Text>
            </>
          )}
        </View>
      </View>

      {/* ─── Fee + route facts ─── */}
      <View style={styles.facts}>
        <Text style={[t.hero, { color: c.tint, fontSize: 40, lineHeight: 44 }]}>{formatKwd(offer.feeKwd)}</Text>
        <View style={styles.factRow}>
          {offer.dropoffZone ? (
            <View style={styles.factChip}>
              <Navigation size={13} color={c.secondaryLabel} />
              <Text style={[t.footnote, { color: c.secondaryLabel }]}>{offer.dropoffZone}</Text>
            </View>
          ) : null}
          {offer.distanceKm != null ? (
            <View style={styles.factChip}>
              <Text style={[t.footnote, { color: c.secondaryLabel }]}>
                {tr("offer.distance", { km: Number(offer.distanceKm).toFixed(1) })}
              </Text>
            </View>
          ) : null}
          <View style={[styles.factChip, isCod && { backgroundColor: c.orangeFill }]}>
            <Banknote size={13} color={isCod ? c.orange : c.secondaryLabel} />
            <Text style={[t.footnote, { color: isCod ? c.orange : c.secondaryLabel, fontFamily: undefined, fontWeight: "700" }]}>
              {isCod ? tr("offer.cod") : tr("offer.prepaid")}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── Actions ─── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.accept, (phase !== "live") && { opacity: 0.5 }]}
          activeOpacity={0.85}
          disabled={phase !== "live"}
          accessibilityRole="button"
          onPress={onAccept}
        >
          <Text style={[t.title3, { color: c.onTint }]}>
            {phase === "accepting" ? tr("offer.accepting") : tr("offer.accept")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.reject, phase !== "live" && { opacity: 0.5 }]}
          activeOpacity={0.7}
          disabled={phase !== "live"}
          accessibilityRole="button"
          onPress={onReject}
        >
          <Text style={[t.headline, { color: c.secondaryLabel }]}>{tr("offer.reject")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function stopSound(ref: { current: Audio.Sound | null }) {
  const s = ref.current;
  ref.current = null;
  if (s) {
    s.stopAsync().catch(() => {}).finally(() => {
      s.unloadAsync().catch(() => {});
    });
  }
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.systemBackground, paddingHorizontal: space.xl, paddingTop: 72, paddingBottom: 48 },
  header: { alignItems: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  ringWrap: { alignItems: "center", justifyContent: "center", marginTop: space.xxl },
  ringCenter: { position: "absolute", alignItems: "center", justifyContent: "center", width: RING_SIZE - 40 },
  facts: { alignItems: "center", marginTop: space.xxl, gap: space.md },
  factRow: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", justifyContent: "center" },
  factChip: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.tertiaryFill,
    borderRadius: radius.capsule, paddingHorizontal: 12, paddingVertical: 6,
  },
  actions: { marginTop: "auto", gap: space.md },
  accept: {
    height: 64, borderRadius: radius.button, backgroundColor: c.tint,
    alignItems: "center", justifyContent: "center", ...continuous, ...shadow.glow,
  },
  reject: {
    height: 50, borderRadius: radius.button, backgroundColor: c.tertiaryFill,
    alignItems: "center", justifyContent: "center", ...continuous,
  },
});
