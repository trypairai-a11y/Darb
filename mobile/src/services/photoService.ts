/**
 * photoService — delivery-photo capture, compress, upload pipeline.
 *
 * Three-step flow:
 *   1. Compress the captured URI down to ~200 KB using expo-image-manipulator
 *      (resize width <= 1280, JPEG, quality 0.7 — keeps detail intact for proof-of-delivery
 *      verification while staying under courier-data-plan caps).
 *   2. POST /api/agent/upload-url to get a presigned PUT URL + an opaque storage key.
 *   3. fetch(presignedUrl, {method:'PUT', headers:{Content-Type:'image/jpeg'}, body:blob}).
 *   4. POST /api/agent/delivery-photo with metadata (key, lat/lng, capturedAt).
 *
 * Why direct-to-storage instead of multipart-through-Express?
 *   A 200 KB JPEG round-tripped through Express costs us 200 KB of egress on Vercel,
 *   plus 200 KB of memory in the Node process. Direct PUT to Cloudflare R2 has zero
 *   egress cost (free) and zero Node memory. The presign step is the only thing the
 *   backend has to mediate — and it's tiny (a signed string).
 */

import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as SecureStore from "./deviceStorage";
import { recordDeliveryPhotoMetadata, requestUploadUrl } from "../api/client";

export interface UploadDeliveryPhotoArgs {
  orderId: string;
  uri: string;
  latitude: number;
  longitude: number;
  /** Arrival at the merchant, versus the handover this was built for. */
  phase?: "ARRIVED_AT_PICKUP";
}

export async function uploadDeliveryPhoto(args: UploadDeliveryPhotoArgs): Promise<{ key: string }> {
  // Step 1: compress. Resize cap of 1280 keeps the JPEG comfortably under 200 KB at
  // quality 0.7 for typical 12 MP courier-phone captures.
  const compressed = await ImageManipulator.manipulateAsync(
    args.uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );

  const deviceId = (await SecureStore.getItemAsync("device_id")) ?? "";
  const capturedAt = new Date().toISOString();

  // Step 2: request the presigned URL + storage key from the backend.
  const presign = await requestUploadUrl({
    deviceId,
    orderId: args.orderId,
    contentType: "image/jpeg",
  });

  // Step 3: PUT the compressed file directly. React Native's fetch accepts a
  // file URI as `body` when paired with the Content-Type header; the native
  // layer streams the file without round-tripping through JS memory. This is
  // the recommended pattern for image uploads in RN
  // (https://reactnative.dev/docs/network#sending-binary-data).
  // Web: the RN file descriptor would serialize as "[object Object]" — resolve
  // the (blob:/data:) URI to a real Blob and PUT that instead.
  const putBody: any =
    Platform.OS === "web"
      ? await (await fetch(compressed.uri)).blob()
      : ({ uri: compressed.uri, name: "delivery.jpg", type: "image/jpeg" } as any);
  const putResponse = await fetch(presign.url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: putBody,
  });
  if (!putResponse.ok) {
    throw new Error(`presigned PUT failed: HTTP ${putResponse.status}`);
  }

  // Step 4: record the metadata so the backend can stitch the photo to the order.
  await recordDeliveryPhotoMetadata({
    deviceId,
    orderId: args.orderId,
    key: presign.key,
    capturedAt,
    latitude: args.latitude,
    longitude: args.longitude,
    ...(args.phase ? { phase: args.phase } : {}),
  });

  return { key: presign.key };
}
