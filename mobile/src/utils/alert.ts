/**
 * Cross-platform alert helpers. react-native-web's Alert.alert is a SILENT
 * no-op — on web that means "sign out" could never confirm and error alerts
 * would vanish. These helpers fall back to window.alert / window.confirm.
 */

import { Alert, Platform } from "react-native";

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    try {
      window.alert([title, message].filter(Boolean).join("\n\n"));
    } catch {
      /* no window (SSR pass) */
    }
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  if (Platform.OS === "web") {
    let ok = false;
    try {
      ok = window.confirm(`${opts.title}\n\n${opts.message}`);
    } catch {
      ok = false;
    }
    if (ok) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelLabel, style: "cancel" },
    {
      text: opts.confirmLabel,
      style: opts.destructive ? "destructive" : "default",
      onPress: opts.onConfirm,
    },
  ]);
}
