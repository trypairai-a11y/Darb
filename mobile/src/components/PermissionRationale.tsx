/**
 * PermissionRationale — two-stage permission rationale modal.
 *
 * iOS denies "Always Allow" location at first ask 70%+ of the time when the system
 * prompt is shown cold (RESEARCH.md Pitfall 2 / Pattern 2). The fix is a courier-facing
 * rationale screen that explains WHY we want continuous GPS before the OS dialog appears.
 *
 * State machine:
 *
 *   explain     ── user taps Continue ─► fg-asking
 *   fg-asking   ── OS dialog ─► granted? ─► bg-explain
 *                            └─► denied  ─► onComplete(false), modal closes
 *   bg-explain  ── user taps Got It ─► bg-asking (startBeacon kicks off bg ask + task)
 *   bg-asking   ── OS dialog ─► granted? ─► onComplete(true)
 *                            └─► denied  ─► onComplete(false)
 *
 * The bg-asking stage piggybacks on startBeacon() because Wave 1 already wires the
 * bg permission request + TaskManager registration there. Calling
 * Location.requestBackgroundPermissionsAsync() inline would split the bg perm grant
 * from the TaskManager registration — fine technically, but error-prone if the
 * permission is granted and we forget to start the beacon. Centralising it in
 * startBeacon() keeps the post-grant happy path atomic.
 *
 * The "Not now" affordance honours iOS HIG — couriers must be able to dismiss the
 * pre-prompt without going through the system dialog. We surface the dismissal as
 * onComplete(false) so the caller can keep onShift=false + show a fallback UI.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { startBeacon } from "../services/locationService";

type Stage = "explain" | "fg-asking" | "bg-explain" | "bg-asking";

export interface PermissionRationaleProps {
  visible: boolean;
  onComplete: (granted: boolean) => void;
}

export function PermissionRationale({ visible, onComplete }: PermissionRationaleProps) {
  const [stage, setStage] = useState<Stage>("explain");

  async function askForeground() {
    setStage("fg-asking");
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      // Reset for next open. Without this, reopening the modal after a denial
      // would show the spinner indefinitely.
      setStage("explain");
      onComplete(false);
      return;
    }
    setStage("bg-explain");
  }

  async function askBackground() {
    setStage("bg-asking");
    // startBeacon performs the bg permission request + TaskManager.startLocationUpdatesAsync
    // atomically. The result tells us whether the beacon is actually running.
    const result = await startBeacon();
    setStage("explain");
    onComplete(result.ok);
  }

  function dismiss() {
    setStage("explain");
    onComplete(false);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={dismiss}>
      <View style={styles.container}>
        {stage === "explain" && (
          <View style={styles.body}>
            <Text style={styles.title}>Darb tracks your location during shifts</Text>
            <Text style={styles.text}>
              We track GPS continuously so the office can see where you are if you have a
              question, and so we can prove your delivery times. We never track you off-shift.
              You can pause anytime from settings.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={askForeground} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismiss} style={styles.secondaryBtn} accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>Not now</Text>
            </TouchableOpacity>
          </View>
        )}

        {(stage === "fg-asking" || stage === "bg-asking") && (
          <View style={styles.body}>
            <ActivityIndicator size="large" color="#F97316" />
            <Text style={[styles.text, styles.center]}>
              {stage === "fg-asking"
                ? "Waiting for location permission..."
                : "Starting the beacon..."}
            </Text>
          </View>
        )}

        {stage === "bg-explain" && (
          <View style={styles.body}>
            <Text style={styles.title}>One more permission</Text>
            <Text style={styles.text}>
              On the next screen, please tap{" "}
              <Text style={styles.emphasis}>Allow All The Time</Text> so the GPS keeps tracking
              when your phone screen is off. Without this, the GPS turns off every time you put
              your phone in your pocket.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={askBackground} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  body: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 16, color: "#1A1A2E" },
  text: { fontSize: 16, lineHeight: 24, color: "#555", marginBottom: 32 },
  emphasis: { fontWeight: "700", color: "#1A1A2E" },
  center: { textAlign: "center", marginTop: 16 },
  primaryBtn: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { padding: 16, alignItems: "center" },
  secondaryBtnText: { color: "#555", fontSize: 14 },
});
