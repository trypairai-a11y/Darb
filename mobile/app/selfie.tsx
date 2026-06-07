import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { uploadSelfie } from "../src/api/client";
import { getCurrentLocation } from "../src/services/locationService";

export default function SelfieScreen() {
  const router = useRouter();
  const { type = "clock_in" } = useLocalSearchParams<{ type: "clock_in" | "clock_out" }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function capture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75, base64: false });
      if (!photo?.uri) throw new Error("Failed to capture photo");

      const loc = await getCurrentLocation();
      await uploadSelfie({
        type: type as "clock_in" | "clock_out",
        imageUri: photo.uri,
        latitude: loc?.coords.latitude || 0,
        longitude: loc?.coords.longitude || 0,
      });

      Alert.alert("Success", type === "clock_in" ? "Clocked in" : "Clocked out");
      router.replace("/(tabs)/dashboard");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to upload selfie");
    }
    setCapturing(false);
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />
      <View style={styles.overlay}>
        <Text style={styles.label}>
          {type === "clock_in" ? "Clock In Selfie" : "Clock Out Selfie"}
        </Text>
        <TouchableOpacity style={styles.captureButton} onPress={capture} disabled={capturing}>
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  overlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingBottom: 60, paddingTop: 20, alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 20 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureInner: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 16 },
  button: { backgroundColor: "#007A3D", borderRadius: 12, padding: 16, paddingHorizontal: 32 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
