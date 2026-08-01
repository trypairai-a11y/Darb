import { useState, useMemo } from "react";
import { View, Text, TextInput, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import { register } from "../src/api/client";
import { Button, Screen } from "../src/components/hig";
import { t as tr } from "../src/i18n/strings";
import { showAlert } from "../src/utils/alert";
import { useTheme, type Palette, space, radius, continuous, fontFamily } from "../src/theme";

export default function EnrollmentScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // The demo driver needs no phone; a real driver does. Enrolment answers with
  // a device credential, and a Darb ID on its own is sequential.
  const isDemo = (next: string) => next.trim().toUpperCase() === "DEMO";

  async function handleEnroll(nextCode = code) {
    if (!nextCode.trim()) return;
    if (!isDemo(nextCode) && !phone.trim()) return;
    setLoading(true);
    try {
      await register(nextCode.trim(), {
        phone: isDemo(nextCode) ? undefined : phone.trim(),
        model: Device.modelName || "unknown",
        // Platform.Version is undefined on web — send a stable label instead.
        osVersion: `${Platform.OS} ${Platform.Version ?? "web"}`,
        appVersion: "1.0.0",
      });
      // Back through the boot gate: it hydrates /state and routes to the
      // right surface (delivery flow if an order is already assigned).
      router.replace("/");
    } catch (err: any) {
      showAlert(tr("enroll.failed_title"), err.message || tr("enroll.failed_body"));
    }
    setLoading(false);
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[t.footnote, styles.kicker]}>{tr("enroll.kicker")}</Text>
        <Text style={[t.title1, { textAlign: "center", marginBottom: space.md }]}>{tr("enroll.title")}</Text>
        <Text style={[t.callout, { color: c.secondaryLabel, textAlign: "center", marginBottom: space.xxl }]}>
          {tr("enroll.subtitle")}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={tr("enroll.placeholder")}
          placeholderTextColor={c.placeholder}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TextInput
          style={[styles.input, { marginTop: space.md }]}
          placeholder={tr("enroll.phone_placeholder")}
          placeholderTextColor={c.placeholder}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCorrect={false}
        />

        {/* Where the Darb ID comes from. The old screen asked for a code that
            appeared on no Darb screen, so nobody could tell a driver what to
            type. This one names the roster. */}
        <Text style={[t.footnote, { color: c.tertiaryLabel, textAlign: "center", marginTop: space.md }]}>
          {tr("enroll.hint")}
        </Text>

        <Button
          title={loading ? tr("enroll.cta_busy") : tr("enroll.cta")}
          onPress={() => handleEnroll()}
          disabled={loading || !code.trim() || !phone.trim()}
          style={{ marginTop: space.lg }}
        />
        {/* Demo is a REAL enrollment against the backend's DEMO code — same
            device-token auth, same live delivery loop, demo tenant data. */}
        <Button title={tr("enroll.demo")} variant="tinted" onPress={() => handleEnroll("DEMO")} disabled={loading} style={{ marginTop: space.md }} />
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
