import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { registerPushToken } from "../api/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<{ ok: boolean; token?: string; reason?: string }> {
  if (!Device.isDevice) {
    return { ok: false, reason: "physical_device_required" };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("darb-inbox", {
      name: "Darb dispatch",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#047857",
    });
  }

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
