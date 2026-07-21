/**
 * deviceStorage — SecureStore-compatible key/value storage that also works on web.
 *
 * Native: delegates 1:1 to expo-secure-store (Keychain / EncryptedSharedPreferences).
 * Web:    expo-secure-store has no web implementation (every call rejects), which
 *         would break the ENTIRE device-token flow — register() could never persist
 *         agent_token/device_id and every API call would look signed-out. On web we
 *         fall back to localStorage. This is a deliberate, documented trade-off:
 *         a browser tab has no secure enclave; the agent token is a low-privilege,
 *         driver-scoped device token and v1 ships the driver app in the browser.
 *
 * Same async API surface as expo-secure-store so callers swap the import only.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const isWeb = Platform.OS === "web";
const PREFIX = "darb-secure:";

function webStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return webStorage()?.getItem(PREFIX + key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.setItem(PREFIX + key, value);
    } catch {
      /* quota/private-mode: best effort */
    }
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.removeItem(PREFIX + key);
    } catch {
      /* best effort */
    }
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
