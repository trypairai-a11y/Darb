import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Image, Modal, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, X, ChevronLeft, Trash2 } from "lucide-react-native";
import { submitTicket } from "../src/api/client";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "ACCIDENT_REPORT", label: "Accident report" },
  { value: "VEHICLE_REPAIR", label: "Vehicle repair" },
  { value: "EQUIPMENT_REQUEST", label: "Equipment request" },
  { value: "LEAVE_REQUEST", label: "Leave request" },
  { value: "SALARY_ISSUE", label: "Salary issue" },
  { value: "TRANSFER_REQUEST", label: "Transfer request" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "OTHER", label: "Other" },
];

const MAX_PHOTOS = 5;

export default function SubmitTicketScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<string>("ACCIDENT_REPORT");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<{ uri: string }[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? category;

  async function openCamera() {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) return;
    }
    setCameraOpen(true);
  }

  async function capture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) {
        setPhotos((prev) => [...prev, { uri: photo.uri }]);
      }
    } catch (e: any) {
      Alert.alert("Camera error", e.message ?? "Failed to capture photo");
    } finally {
      setCameraOpen(false);
    }
  }

  async function onSubmit() {
    if (!title.trim()) { Alert.alert("Missing field", "Please enter a title."); return; }
    if (!description.trim()) { Alert.alert("Missing field", "Please enter a description."); return; }

    setSubmitting(true);
    try {
      await submitTicket({
        category,
        title: title.trim(),
        description: description.trim(),
        priority: category === "ACCIDENT_REPORT" ? "HIGH" : "MEDIUM",
        photos,
      });
      router.replace("/(tabs)/tickets");
    } catch (e: any) {
      Alert.alert("Submission failed", e.message ?? "Please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ChevronLeft size={22} color="#111827" />
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New ticket</Text>
        <View style={{ width: 70 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity style={styles.select} onPress={() => setCategoryOpen(true)}>
            <Text style={styles.selectText}>{categoryLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Short summary"
            placeholderTextColor="#9CA3AF"
            maxLength={120}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What happened? Add any details that help your supervisor."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
          <View style={styles.photosGrid}>
            {photos.map((p, idx) => (
              <View key={idx} style={styles.photoCell}>
                <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.addPhoto} onPress={openCamera}>
                <Camera size={22} color="#6B7280" />
                <Text style={styles.addPhotoText}>Add photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submit, submitting && styles.submitDisabled]}
            onPress={onSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit ticket</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setCategoryOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Pick a category</Text>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={styles.modalRow}
                onPress={() => { setCategory(c.value); setCategoryOpen(false); }}
              >
                <Text style={[styles.modalRowText, category === c.value && styles.modalRowTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => setCameraOpen(false)}>
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.cameraClose} onPress={() => setCameraOpen(false)}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureButton} onPress={capture}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#fff", borderBottomColor: "#E5E7EB", borderBottomWidth: 1,
  },
  back: { flexDirection: "row", alignItems: "center", width: 70 },
  backText: { fontSize: 16, color: "#111827", marginLeft: 2 },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  body: { padding: 20, gap: 8, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: "600", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12 },
  select: {
    backgroundColor: "#fff", borderColor: "#E5E7EB", borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14,
  },
  selectText: { fontSize: 16, color: "#111827" },
  input: {
    backgroundColor: "#fff", borderColor: "#E5E7EB", borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: "#111827",
  },
  textarea: { minHeight: 120, paddingTop: 12 },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  photoCell: { width: 88, height: 88, borderRadius: 10, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  removeBtn: {
    position: "absolute", top: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999,
    width: 24, height: 24, alignItems: "center", justifyContent: "center",
  },
  addPhoto: {
    width: 88, height: 88, borderRadius: 10,
    borderColor: "#D1D5DB", borderWidth: 1, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  addPhotoText: { fontSize: 11, color: "#6B7280" },
  submit: {
    backgroundColor: "#F97316", borderRadius: 12,
    paddingVertical: 16, alignItems: "center", marginTop: 28,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  modalTitle: { fontSize: 14, fontWeight: "600", color: "#6B7280", textAlign: "center", paddingVertical: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  modalRow: { paddingVertical: 14, paddingHorizontal: 24, borderTopColor: "#F3F4F6", borderTopWidth: 1 },
  modalRowText: { fontSize: 16, color: "#111827" },
  modalRowTextActive: { color: "#F97316", fontWeight: "600" },
  cameraContainer: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingBottom: 60, paddingTop: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  cameraClose: {
    position: "absolute", left: 24, bottom: 80,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
  },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
});
