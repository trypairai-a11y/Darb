import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { hasToken } from "../src/api/client";
import { hydrateNow } from "../src/services/offerChannel";
import { useDriverStore } from "../src/store/driverStore";
import { useTheme } from "../src/theme";

/**
 * Boot gate:
 *   no token            → /enrollment (the demo path there does a REAL
 *                          register("DEMO") against the backend)
 *   token + activeOrder → /delivery   (relaunch mid-delivery restores the flow)
 *   token, idle         → /(tabs)/home
 *
 * We hydrate from GET /api/agent/state before routing; if the network is down
 * we fall back to the persisted skeleton (availability + active order id kept
 * in AsyncStorage) so the courier still lands on the right screen.
 */
export default function BootGate() {
  const router = useRouter();
  const { c } = useTheme();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enrolled = await hasToken();
      if (cancelled) return;
      if (!enrolled) {
        router.replace("/enrollment");
        return;
      }

      await hydrateNow(); // false on network failure — persisted state routes us
      if (cancelled) return;

      const s = useDriverStore.getState();
      const hasOrder = s.activeOrder != null || (!s.hydrated && s.persistedActiveOrderId != null);
      router.replace(hasOrder ? "/delivery" : "/(tabs)/home");
    })().finally(() => {
      if (!cancelled) setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.systemBackground }}>
      {checking ? <ActivityIndicator size="large" color={c.tint} /> : null}
    </View>
  );
}
