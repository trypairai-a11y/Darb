import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { setLastTab, type PlatformHint } from "../src/services/platformGuess";

const PLATFORM_HINTS: ReadonlyArray<PlatformHint> = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"];

function isPlatformHint(p: string | null): p is PlatformHint {
  return !!p && (PLATFORM_HINTS as ReadonlyArray<string>).includes(p);
}

export default function RootLayout() {
  // Cold-start platform-attribution hint. Without this, the tier-3 hint stays null
  // until the courier taps a tab — which means the first GPS upload after launch
  // ships with no platformGuess, forcing the backend to fall back to tier-1/2
  // evidence (often unavailable for a courier who just opened the app).
  //
  // The driver_platform key is set during /api/agent/register response handling
  // (see api/client.ts: SecureStore.setItemAsync('driver_id', ...) — driver_platform
  // is set alongside driver_id when the backend includes it in the register response).
  // Per-screen useFocusEffect calls (see orders.tsx) keep the hint warm after this.
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync("driver_platform").then((p) => {
      if (cancelled) return;
      if (isPlatformHint(p)) setLastTab(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="enrollment" />
      <Stack.Screen name="selfie" />
      <Stack.Screen name="ticket-detail" />
      <Stack.Screen name="submit-ticket" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
