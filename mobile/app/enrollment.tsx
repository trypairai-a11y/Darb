import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import { register } from "../src/api/client";

export default function EnrollmentScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEnroll(nextCode = code) {
    if (!nextCode.trim()) return;
    setLoading(true);
    try {
      await register(nextCode.trim(), {
        model: Device.modelName || "unknown",
        osVersion: `${Platform.OS} ${Platform.Version}`,
        appVersion: "1.0.0",
      });
      router.replace("/(tabs)/dashboard");
    } catch (err: any) {
      Alert.alert("Enrollment Failed", err.message || "Check your code and try again");
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Darb Driver</Text>
      <Text style={styles.title}>Start your shift with confidence.</Text>
      <Text style={styles.subtitle}>Enter the code from your supervisor, or use the demo driver to preview the app.</Text>

      <TextInput
        style={styles.input}
        placeholder="Enrollment Code"
        placeholderTextColor="#86868b"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={() => handleEnroll()}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? "Enrolling..." : "Enroll Device"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => {
          setCode("DEMO");
          handleEnroll("DEMO");
        }}
        disabled={loading}
      >
        <Text style={styles.secondaryButtonText}>Use demo driver</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#f5f5f7" },
  kicker: { fontSize: 13, fontWeight: "700", color: "#007A3D", textAlign: "center", marginBottom: 10 },
  title: { fontSize: 32, fontWeight: "700", textAlign: "center", marginBottom: 10, color: "#1d1d1f", lineHeight: 38 },
  subtitle: { fontSize: 15, color: "#6e6e73", textAlign: "center", marginBottom: 32, lineHeight: 21 },
  input: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, fontSize: 18,
    textAlign: "center", letterSpacing: 4, borderWidth: 1, borderColor: "#e5e5ea",
    color: "#1d1d1f",
  },
  button: {
    backgroundColor: "#007A3D", borderRadius: 16, padding: 16,
    marginTop: 24, alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: {
    borderRadius: 16, padding: 16, marginTop: 12, alignItems: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e5ea",
  },
  secondaryButtonText: { color: "#007A3D", fontWeight: "600", fontSize: 16 },
});
