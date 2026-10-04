import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Check, Phone, Store } from "lucide-react-native";
import { postOrderFailed, postOrderReturned, type ReturnTo } from "../../src/api/client";
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
  const advanceOrder = useDriverStore((s) => s.advanceOrder);
  const [reason, setReason] = useState<FailReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Client request 2026-08-31: a failed delivery goes back to the shop, so
  // reporting it opens the return leg. Revision 21c (client note,
  // 2026-09-21): the return is not optional. The order stays the driver's
  // active order, at stage RETURNING, until they confirm the hand-back, so
  // closing the app or pressing Home lands them straight back here, and
  // the server offers them nothing new in between.
  const [returnTo, setReturnTo] = useState<ReturnTo | null>(null);

  const submit = useCallback(async () => {
    if (!order || !reason || submitting) return;
    if (reason === "OTHER" && !note.trim()) return;
    setSubmitting(true);
    try {
      const res = await postOrderFailed(order.id, reason, note.trim() || undefined);
      setReturnTo(res.returnTo ?? null);
      advanceOrder("RETURNING");
      void hydrateNow();
    } catch (e: any) {
      Alert.alert(tr("failed.title"), e?.message || tr("common.retry"));
    } finally {
      setSubmitting(false);
    }
  }, [order, reason, note, submitting, advanceOrder]);

  const confirmReturned = useCallback(async () => {
    if (!order || submitting) return;
    setSubmitting(true);
    try {
      await postOrderReturned(order.id);
      completeOrder();
      void hydrateNow();
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert(tr("failed.return_title"), e?.message || tr("common.retry"));
    } finally {
      setSubmitting(false);
    }
  }, [order, submitting, router, completeOrder]);

  // ─── Return leg ───
  // Reached from the report above, or on reopen when the server still says
  // FAILED. The pickup on the order itself is the fallback for the latter.
  if (order && order.stage === "RETURNING") {
    const to: ReturnTo | null =
      returnTo ??
      (order.pickup
        ? {
            branchName: order.pickup.name ?? null,
            address: order.pickup.address ?? null,
            lat: order.pickup.lat ?? null,
            lng: order.pickup.lng ?? null,
            phone: order.pickup.phone ?? null,
          }
        : null);
    return (
      <Screen>
        <NavBar title={tr("failed.return_title")} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.returnCard}>
            <Store size={28} color={c.tint} />
            <Text style={[t.headline, { marginTop: space.sm }]}>
              {to?.branchName ?? tr("failed.return_shop")}
            </Text>
            {to?.address ? (
              <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: 4, textAlign: "center" }]}>
                {to.address}
              </Text>
            ) : null}
            {to?.phone ? (
              <TouchableOpacity
                style={styles.callRow}
                activeOpacity={0.7}
                onPress={() => Linking.openURL(`tel:${to.phone}`).catch(() => {})}
              >
                <Phone size={15} color={c.tint} />
                <Text style={[t.subheadline, { color: c.tint }]}>{to.phone}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[t.subheadline, { color: c.secondaryLabel, marginTop: space.lg, textAlign: "center" }]}>
            {tr("failed.return_body")}
          </Text>
          <Button
            title={tr("failed.return_confirm")}
            onPress={() => void confirmReturned()}
            disabled={submitting}
            style={{ marginTop: space.xl }}
          />
          <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: space.md, textAlign: "center" }]}>
            {tr("failed.return_required")}
          </Text>
        </ScrollView>
      </Screen>
    );
  }

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
  returnCard: {
    alignItems: "center", backgroundColor: c.groupedSecondary, borderRadius: radius.card,
    borderWidth: 1, borderColor: c.hairline, padding: space.lg, marginTop: space.lg, ...continuous,
  },
  callRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm, padding: 4 },
});
