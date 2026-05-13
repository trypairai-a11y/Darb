import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  SafeAreaView, ActivityIndicator, TouchableOpacity, Alert, Modal,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { agentFetch } from "../../src/api/client";
import { uploadDeliveryPhoto } from "../../src/services/photoService";
import { setLastTab, type PlatformHint } from "../../src/services/platformGuess";

interface Order {
  id: string;
  platform: string;
  status: string;
  customerName?: string;
  merchantName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  amount?: number;
  createdAt: string;
}

const PLATFORM_HINTS: ReadonlyArray<PlatformHint> = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"];

function isPlatformHint(p: string | null): p is PlatformHint {
  return !!p && (PLATFORM_HINTS as ReadonlyArray<string>).includes(p);
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Camera capture for Mark Delivered. We open a fullscreen Modal hosting a
  // CameraView (mirrors selfie.tsx). Keeping the camera off-tree until needed
  // avoids holding the camera hardware while the courier scrolls the order list.
  const [cameraOrderId, setCameraOrderId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const fetchOrders = useCallback(async () => {
    try {
      const data = await agentFetch<{ data: Order[] }>("/api/agent/orders");
      setOrders(data.data || []);
    } catch {
      // Fetch failed silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // tier-3 platform-attribution hint. The Driver row on the backend stores the
  // courier's primary platform; we cache it as `driver_platform` in SecureStore
  // during /api/agent/register response handling. On every Orders tab focus we
  // re-emit setLastTab so the platformGuess cache stays warm + decays cleanly
  // when the courier leaves the tab for >30 min.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      SecureStore.getItemAsync("driver_platform").then((p) => {
        if (cancelled) return;
        if (isPlatformHint(p)) setLastTab(p);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case "delivered":
      case "completed": return "#16a34a";
      case "in_progress":
      case "picked_up": return "#F97316";
      case "cancelled": return "#dc2626";
      default: return "#6B7280";
    }
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const openCameraForOrder = useCallback(async (orderId: string) => {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) {
        Alert.alert("Camera Required", "Grant camera permission to capture delivery photo.");
        return;
      }
    }
    setCameraOrderId(orderId);
  }, [camPermission, requestCamPermission]);

  const closeCamera = useCallback(() => {
    setCameraOrderId(null);
  }, []);

  const capture = useCallback(async () => {
    if (!cameraRef.current || !cameraOrderId || uploading) return;
    setUploading(true);
    try {
      // Capture WITHOUT base64 — Wave 1 photoService streams the file URI through
      // the native HTTP stack via RN binary upload; pulling base64 here would
      // double JS-heap usage during the compress step.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
      if (!photo?.uri) throw new Error("Capture returned no URI");

      // Get current GPS for the delivery-photo metadata. Permissions were
      // granted at shift start via PermissionRationale; this call should
      // succeed without a re-prompt. Falls back to {0,0} if permission was
      // somehow revoked between Start Shift and Mark Delivered — backend will
      // still accept the row but flag it via the violation engine.
      const loc = await Location
        .getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .catch(() => null);

      await uploadDeliveryPhoto({
        orderId: cameraOrderId,
        uri: photo.uri,
        latitude: loc?.coords.latitude ?? 0,
        longitude: loc?.coords.longitude ?? 0,
      });

      Alert.alert("Photo uploaded", "Delivery photo recorded.");
      setCameraOrderId(null);
    } catch (e: any) {
      // Per the plan threat-model T-05-03-04: uploadDeliveryPhoto rethrows on
      // any failure step so the courier sees the failure + can retry manually.
      Alert.alert("Upload failed", e?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  }, [cameraOrderId, uploading]);

  function renderOrder({ item }: { item: Order }) {
    const isDelivered = ["delivered", "completed"].includes(item.status.toLowerCase());
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.platformBadge}>
            <Text style={styles.platformText}>{item.platform}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        {item.merchantName && (
          <Text style={styles.merchantName}>{item.merchantName}</Text>
        )}

        {item.deliveryAddress && (
          <Text style={styles.address} numberOfLines={1}>{item.deliveryAddress}</Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
          {item.amount != null && (
            <Text style={styles.amount}>{item.amount.toFixed(3)} KD</Text>
          )}
        </View>

        {!isDelivered && (
          <TouchableOpacity
            style={styles.deliverBtn}
            onPress={() => openCameraForOrder(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Mark order ${item.id} delivered`}
          >
            <Text style={styles.deliverBtnText}>Mark Delivered</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Orders</Text>

        {orders.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No orders yet today</Text>
            <Text style={styles.emptySubtext}>Orders will appear here once your shift is active</Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            renderItem={renderOrder}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F97316" />
            }
          />
        )}
      </View>

      <Modal visible={cameraOrderId !== null} animationType="slide" onRequestClose={closeCamera}>
        <View style={styles.cameraContainer}>
          {cameraOrderId !== null && (
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          )}
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraLabel}>Capture delivery photo</Text>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={capture}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Take delivery photo"
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.captureInner} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={closeCamera}
              style={styles.cancelBtn}
              disabled={uploading}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f5f7" },
  container: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginTop: 16, marginBottom: 16 },
  list: { paddingBottom: 24 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#374151" },
  emptySubtext: { fontSize: 14, color: "#86868b", marginTop: 8, textAlign: "center" },
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  platformBadge: {
    backgroundColor: "#1A1A2E", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  platformText: { color: "#fff", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  merchantName: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  address: { fontSize: 13, color: "#6B7280", marginBottom: 8 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { fontSize: 12, color: "#86868b" },
  amount: { fontSize: 14, fontWeight: "700", color: "#16a34a" },
  deliverBtn: {
    marginTop: 12,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deliverBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cameraContainer: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingBottom: 60, paddingTop: 20, alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  cameraLabel: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 20 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureInner: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff",
  },
  cancelBtn: { padding: 16, marginTop: 8 },
  cancelBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
