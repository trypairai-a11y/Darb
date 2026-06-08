import { useState, useMemo } from "react";
import { View, Text, TextInput, StyleSheet, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import { register } from "../src/api/client";
import { Button, Screen } from "../src/components/hig";
import { useTheme, type Palette, space, radius, continuous, fontFamily } from "../src/theme";

export default function EnrollmentScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
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
      Alert.alert("Enrollment failed", err.message || "Check your code and try again");
    }
    setLoading(false);
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[t.footnote, styles.kicker]}>DARB DRIVER</Text>
        <Text style={[t.title1, { textAlign: "center", marginBottom: space.md }]}>Start your shift with confidence.</Text>
        <Text style={[t.callout, { color: c.secondaryLabel, textAlign: "center", marginBottom: space.xxl }]}>
          Enter the code from your supervisor, or preview the app with the demo driver.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enrollment code"
          placeholderTextColor={c.placeholder}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Button title={loading ? "Enrolling…" : "Enroll device"} onPress={() => handleEnroll()} disabled={loading} style={{ marginTop: space.lg }} />
        <Button title="Use demo driver" variant="tinted" onPress={() => router.replace("/(tabs)/dashboard")} disabled={loading} style={{ marginTop: space.md }} />
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
  kicker: { color: c.tint, fontWeight: "700", letterSpacing: 1, textAlign: "center", marginBottom: space.md },
  input: {
    fontFamily, fontSize: 20, fontWeight: "600", backgroundColor: c.groupedSecondary, borderRadius: radius.button,
    paddingVertical: space.base, textAlign: "center", letterSpacing: 4, color: c.label, ...continuous,
  },
});
