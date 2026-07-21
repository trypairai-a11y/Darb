import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { registerPushToken } from "../api/client";

// Web: there is NO push channel — offer delivery relies on the offerChannel
// foreground poll (4s hunting / 12s active). Everything here no-ops cleanly.
if (Platform.OS !== "web") {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* never let module load crash the app */
  }
}

/**
 * Android channels:
 *   darb-inbox  — general dispatch/ops messages (HIGH)
 *   darb-offers — dispatch offers (MAX importance, sound + strong vibration).
 *     Push here is a WAKE-UP nudge only: payloads are data-only
 *     ({type:"dispatch_offer", offerId, ...}) and the app re-hydrates from
 *     GET /api/agent/state. The countdown is NEVER rendered from the push.
 */
async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("darb-inbox", {
    name: "Darb dispatch",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#047857",
  });
  await Notifications.setNotificationChannelAsync("darb-offers", {
    name: "Delivery offers",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 200, 400, 200, 600],
    lightColor: "#C6FF3A",
    enableVibrate: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function registerForPushNotifications(): Promise<{ ok: boolean; token?: string; reason?: string }> {
  if (Platform.OS === "web") {
    // No Expo push on web — polling is the delivery channel.
    return { ok: false, reason: "web_unsupported" };
  }
  if (!Device.isDevice) {
    return { ok: false, reason: "physical_device_required" };
  }

  await ensureAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== "granted") {
    return { ok: false, reason: "permission_denied" };
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await registerPushToken(token);
  return { ok: true, token };
}

export interface PushData {
  type?: string;
  offerId?: string;
  [k: string]: unknown;
}

function dataFrom(notification: Notifications.Notification): PushData {
  return (notification.request.content.data ?? {}) as PushData;
}

/**
 * Wire both push entry points to a single callback (app/_layout.tsx passes a
 * hydrateNow trigger). Fires for:
 *   - data messages received while the app is foregrounded
 *   - the user tapping a notification (background/killed → warm start)
 * Returns an unsubscribe function.
 */
export function addPushWakeupListener(onWake: (data: PushData) => void): () => void {
  if (Platform.OS === "web") return () => {};
  const received = Notifications.addNotificationReceivedListener((notification) => {
    onWake(dataFrom(notification));
  });
  const response = Notifications.addNotificationResponseReceivedListener((res) => {
    onWake(dataFrom(res.notification));
  });
  return () => {
    received.remove();
    response.remove();
  };
}
