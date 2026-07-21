/**
 * webImagePicker — web-only photo capture via a transient
 * <input type="file" accept="image/*" capture="environment">.
 *
 * On phone browsers `capture="environment"` opens the native rear camera; on
 * desktop it degrades to a file picker. The selected file is exposed as an
 * object URL so downstream code (Image preview, photoService compress+upload)
 * treats it exactly like a native camera URI.
 *
 * No-ops (calls back with null) on native or when the DOM is unavailable.
 */

import { Platform } from "react-native";

export function pickWebPhoto(onPicked: (uri: string | null) => void): void {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    onPicked(null);
    return;
  }
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // Non-standard but widely supported on mobile browsers.
    (input as any).capture = "environment";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files && input.files[0];
      onPicked(file ? URL.createObjectURL(file) : null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  } catch {
    onPicked(null);
  }
}
