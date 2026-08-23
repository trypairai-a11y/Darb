import { useEffect, useRef, useState } from "react";
import { AppState, I18nManager, Platform, View, type AppStateStatus } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "../src/services/deviceStorage";
// No downloaded faces: the app runs the same system stack the web platform
// does (SF Pro on Apple, system UI elsewhere, Almarai for Arabic), so there is
// nothing to gate a first render on and two fewer downloads on mobile data.
import { setLastTab, type PlatformHint } from "../src/services/platformGuess";
import { hydrateNow, startOfferChannel, stopOfferChannel } from "../src/services/offerChannel";
import { flushEventOutbox } from "../src/services/eventOutbox";
import { addPushWakeupListener } from "../src/services/pushNotifications";
import { useDriverStore } from "../src/store/driverStore";
import { useLanguageStore } from "../src/store/languageStore";

// Layout stays LTR by design even in Arabic: we deliberately do NOT flip RTL
// layout — Arabic strings render right-to-left inside Text naturally.
I18nManager.allowRTL(false);

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

  // Web GPS lifeline: wire the watchPosition beacon to availability +
  // visibilitychange so a page reload while ONLINE resumes tracking. No-op on
  // native (the TaskManager beacon owns that path).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    import("../src/services/webLocationService")
      .then((m) => m.initWebLocationService())
      .catch(() => {});
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
  // Language store hydrates from AsyncStorage before first render (gated with
  // the same fail-open timeout as fonts). `lang` re-keys the navigator so a
  // language change re-renders every mounted screen without an app restart.
  const lang = useLanguageStore((s) => s.lang);
  const langHydrated = useLanguageStore((s) => s.hydrated);
  const fontsLoaded = true;
  const fontError = null;
  // Fail-open: never block the UI on fonts. Render once they load or error, and
  // hard-stop the gate after 1.2s so a slow/failed web font falls back to system.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 1200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    // deviceStorage works on web too (localStorage) — no platform guard needed.
    let cancelled = false;
    SecureStore.getItemAsync("driver_platform")
      .then((p) => { if (!cancelled && isPlatformHint(p)) setLastTab(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if ((!fontsLoaded && !fontError && !timedOut) || (!langHydrated && !timedOut)) {
    return <View style={{ flex: 1, backgroundColor: "#FBFAF8" }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DeliveryLoopController />
      <Stack key={lang} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FBFAF8" } }}>
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
        {/* settings moved into (tabs) on 2026-08-04; declaring it here too would
            register a second route for the same file and shadow the tab. */}
        <Stack.Screen name="points" />
      </Stack>
    </SafeAreaProvider>
  );
}
