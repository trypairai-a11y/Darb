import { useEffect, useRef, useState } from "react";
import { AppState, Platform, View, type AppStateStatus } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { setLastTab, type PlatformHint } from "../src/services/platformGuess";
import { hydrateNow, startOfferChannel, stopOfferChannel } from "../src/services/offerChannel";
import { flushEventOutbox } from "../src/services/eventOutbox";
import { addPushWakeupListener } from "../src/services/pushNotifications";
import { useDriverStore } from "../src/store/driverStore";

const PLATFORM_HINTS: ReadonlyArray<PlatformHint> = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"];
function isPlatformHint(p: string | null): p is PlatformHint {
  return !!p && (PLATFORM_HINTS as ReadonlyArray<string>).includes(p);
}

/**
 * DeliveryLoopController — owns the offer-channel lifecycle + reactive routing.
 *
 *   - AppState active     → hydrate, flush outbox, (re)start the poll loop
 *   - AppState background → stop the poll loop (bg GPS task keeps a 30s pulse)
 *   - store: offer appears → present /offer (fullScreenModal)
 *   - store: order appears outside the delivery flow (e.g. supervisor manual
 *     assign discovered via hydrate) → route to /delivery
 *   - push data message / notification tap → immediate hydrate (wake-up nudge;
 *     the countdown itself always derives from /state's expiresAt + skew)
 */
function DeliveryLoopController() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const activeOffer = useDriverStore((s) => s.activeOffer);
  const activeOrder = useDriverStore((s) => s.activeOrder);
  const availability = useDriverStore((s) => s.availability);

  // Channel lifecycle: react to availability/order changes.
  useEffect(() => {
    if (AppState.currentState === "active") startOfferChannel();
  }, [availability, activeOrder?.id]);

  // AppState transitions.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void hydrateNow().then(() => startOfferChannel());
        void flushEventOutbox().catch(() => {});
      } else if (next === "background" || next === "inactive") {
        stopOfferChannel();
      }
    });
    return () => sub.remove();
  }, []);

  // Push wake-up (data-only payloads; Android "darb-offers" MAX channel).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const unsub = addPushWakeupListener(() => {
      void hydrateNow().then(() => startOfferChannel());
    });
    return unsub;
  }, []);

  // Offer → present the locked modal.
  useEffect(() => {
    const path = pathnameRef.current;
    if (activeOffer && !activeOrder && path !== "/offer") {
      router.push("/offer");
    }
  }, [activeOffer?.id]);

  // Order appears while we're idling on tabs → enter the delivery flow.
  useEffect(() => {
    const path = pathnameRef.current;
    if (!activeOrder) return;
    const inFlow = path.startsWith("/delivery") || path === "/offer" || path === "/sos";
    if (!inFlow) router.replace("/delivery");
  }, [activeOrder?.id]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  // Fail-open: never block the UI on fonts. Render once they load or error, and
  // hard-stop the gate after 1.2s so a slow/failed web font falls back to system.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 1200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    SecureStore.getItemAsync("driver_platform")
      .then((p) => { if (!cancelled && isPlatformHint(p)) setLastTab(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!fontsLoaded && !fontError && !timedOut) {
    return <View style={{ flex: 1, backgroundColor: "#0A0B0D" }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DeliveryLoopController />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0B0D" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="enrollment" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="offer"
          options={{ presentation: "fullScreenModal", gestureEnabled: false, animation: "fade" }}
        />
        <Stack.Screen name="delivery/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="delivery/pod" />
        <Stack.Screen name="delivery/failed" />
        <Stack.Screen name="sos" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings" />
      </Stack>
    </SafeAreaProvider>
  );
}
