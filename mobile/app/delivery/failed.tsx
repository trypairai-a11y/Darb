import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { postOrderFailed } from "../../src/api/client";
import { Button, NavBar, Screen } from "../../src/components/hig";
import { t as tr } from "../../src/i18n/strings";
import { hydrateNow } from "../../src/services/offerChannel";
import { useDriverStore } from "../../src/store/driverStore";
import { useTheme, type Palette, space, radius, continuous, fontFamily } from "../../src/theme";

const REASONS = ["CUSTOMER_UNREACHABLE", "WRONG_ADDRESS", "CUSTOMER_REFUSED", "OTHER"] as const;
type FailReason = (typeof REASONS)[number];

export default function DeliveryFailedScreen() {
  const router = useRouter();
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const order = useDriverStore((s) => s.activeOrder);
  const completeOrder = useDriverStore((s) => s.completeOrder);
  const [reason, setReason] = useState<FailReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (!order || !reason || submitting) return;
    if (reason === "OTHER" && !note.trim()) return;
    setSubmitting(true);
    try {
      await postOrderFailed(order.id, reason, note.trim() || undefined);
      completeOrder();
      void hydrateNow();
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert(tr("failed.title"), e?.message || tr("common.retry"));
    } finally {
      setSubmitting(false);
    }
  }, [order, reason, note, submitting, completeOrder, router]);

  if (!order) {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <Screen>
      <NavBar title={tr("failed.title")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[t.subheadline, { color: c.secondaryLabel }]}>{tr("failed.subtitle")}</Text>

        <View style={{ marginTop: space.lg, gap: space.sm }}>
          {REASONS.map((r) => {
            const active = reason === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.reason, active && { borderColor: c.red, backgroundColor: c.redFill }]}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setReason(r)}
              >
                <Text style={[t.body, active && { color: c.red, fontFamily: undefined, fontWeight: "700" }]}>
                  {tr(`failed.reason.${r}`)}
                </Text>
                {active ? <Check size={18} color={c.red} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {reason === "OTHER" ? (
          <TextInput
            style={styles.note}
            placeholder={tr("failed.note_placeholder")}
            placeholderTextColor={c.placeholder}
            value={note}
            onChangeText={setNote}
            multiline
          />
        ) : null}

        <Button
          title={tr("failed.submit")}
          variant="destructive"
          onPress={() => void submit()}
          disabled={!reason || submitting || (reason === "OTHER" && !note.trim())}
          style={{ marginTop: space.xl }}
        />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.base, paddingTop: space.lg, paddingBottom: space.xxxl },
  reason: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: c.groupedSecondary, borderRadius: radius.field, borderWidth: 1, borderColor: c.hairline,
    paddingHorizontal: space.base, minHeight: 56, ...continuous,
  },
  note: {
    fontFamily, fontSize: 16, color: c.label, backgroundColor: c.groupedSecondary,
    borderRadius: radius.field, borderWidth: 1, borderColor: c.hairline,
    padding: space.base, minHeight: 90, textAlignVertical: "top", marginTop: space.md, ...continuous,
  },
});
