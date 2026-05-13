/**
 * Wave 3 end-to-end test — asserts the FULL uploadDeliveryPhoto pipeline runs in order:
 *
 *   1. compress (ImageManipulator.manipulateAsync)
 *   2. presign  (api.requestUploadUrl)
 *   3. PUT      (global.fetch → presigned URL)
 *   4. metadata (api.recordDeliveryPhotoMetadata)
 *
 * The Wave 0 tests (photoService.compress.test.ts + photoService.uploadDirect.test.ts)
 * exercise the steps in isolation. This test pins the *interaction order* + the failure
 * propagation so a future refactor can't accidentally reorder steps (e.g. fire-and-forget
 * the metadata POST before the PUT confirms — that would leave dangling OrderEvent rows
 * pointing to keys that never made it to R2).
 *
 * Implementation note on fetch call count:
 *
 *   The shipped Wave 1 photoService uses the RN-conventional `body: { uri, name, type }`
 *   pattern for PUT (single fetch call). The plan recipe in 05-03-PLAN.md tasks 1.4
 *   describes a `fetch(compressed.uri).then(blob).then(PUT)` variant which would issue
 *   two fetch calls. The shipped path is the one we test against — it saves a JS-memory
 *   round-trip and matches the RN docs for binary uploads
 *   (https://reactnative.dev/docs/network#sending-binary-data). See Wave 1 SUMMARY
 *   "decisions" key for the choice rationale.
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as SecureStore from "expo-secure-store";
import { __mockApi as mockApi } from "./mocks/api-client";

const mockManipulator = ImageManipulator as unknown as {
  manipulateAsync: jest.Mock;
  SaveFormat: { JPEG: string };
};

describe("photoService.uploadDeliveryPhoto — end-to-end", () => {
  beforeEach(() => {
    // setup.ts already calls __resetStore + clearAllMocks. We re-seed device_id
    // because the service short-circuits with empty deviceId otherwise.
    (SecureStore as any).__seedStore({ device_id: "dev-test-1" });

    mockManipulator.manipulateAsync.mockResolvedValueOnce({
      uri: "file://compressed.jpg",
      width: 1280,
      height: 960,
    });
    mockApi.requestUploadUrl.mockResolvedValueOnce({
      url: "https://r2.example/put",
      key: "tenA/order1/dev-test-1/123.jpg",
      expiresInSec: 300,
    });
    mockApi.recordDeliveryPhotoMetadata.mockResolvedValueOnce({ ok: true });
  });

  test("runs compress → presign → PUT → metadata in that order", async () => {
    // Reset the beforeEach-staged `mockResolvedValueOnce`s so the implementation
    // hooks below are the ONLY queued behaviours for this test. Without the reset
    // the implementation hooks land behind the staged resolutions and never fire.
    mockManipulator.manipulateAsync.mockReset();
    mockApi.requestUploadUrl.mockReset();
    mockApi.recordDeliveryPhotoMetadata.mockReset();

    // Track invocation order by index of jest's internal call stamp.
    const orderTrace: string[] = [];
    mockManipulator.manipulateAsync.mockImplementationOnce(async () => {
      orderTrace.push("compress");
      return { uri: "file://compressed.jpg", width: 1280, height: 960 } as any;
    });
    mockApi.requestUploadUrl.mockImplementationOnce(async () => {
      orderTrace.push("presign");
      return {
        url: "https://r2.example/put",
        key: "tenA/order1/dev-test-1/123.jpg",
        expiresInSec: 300,
      };
    });
    const fetchMock = jest.fn().mockImplementationOnce(async () => {
      orderTrace.push("put");
      return { ok: true, status: 200 };
    });
    global.fetch = fetchMock as any;
    mockApi.recordDeliveryPhotoMetadata.mockImplementationOnce(async () => {
      orderTrace.push("metadata");
      return { ok: true };
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { uploadDeliveryPhoto } = require("../src/services/photoService");
    await uploadDeliveryPhoto({
      orderId: "order1",
      uri: "file://orig.jpg",
      latitude: 29.3759,
      longitude: 47.9774,
    });

    expect(orderTrace).toEqual(["compress", "presign", "put", "metadata"]);

    // Step 1 — compress called with width<=1280, JPEG, 0.7
    expect(mockManipulator.manipulateAsync).toHaveBeenCalledWith(
      "file://orig.jpg",
      [{ resize: { width: 1280 } }],
      expect.objectContaining({ compress: 0.7, format: mockManipulator.SaveFormat.JPEG }),
    );

    // Step 2 — presign called with the right shape, forwarding deviceId from SecureStore
    expect(mockApi.requestUploadUrl).toHaveBeenCalledWith({
      deviceId: "dev-test-1",
      orderId: "order1",
      contentType: "image/jpeg",
    });

    // Step 3 — PUT lands on the URL the presign returned with image/jpeg Content-Type
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r2.example/put",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "image/jpeg" }),
      }),
    );

    // Step 4 — metadata recorded with the presign's key + the input lat/lng
    expect(mockApi.recordDeliveryPhotoMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "dev-test-1",
        orderId: "order1",
        key: "tenA/order1/dev-test-1/123.jpg",
        latitude: 29.3759,
        longitude: 47.9774,
        capturedAt: expect.any(String),
      }),
    );
  });

  test("throws when the presigned PUT returns non-2xx — metadata is NOT recorded", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: false, status: 403 });
    global.fetch = fetchMock as any;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { uploadDeliveryPhoto } = require("../src/services/photoService");
    await expect(
      uploadDeliveryPhoto({
        orderId: "order1",
        uri: "file://orig.jpg",
        latitude: 0,
        longitude: 0,
      }),
    ).rejects.toThrow(/presigned PUT failed/);

    // Critical: a failed PUT must NOT leave an OrderEvent row pointing at a key
    // that never received bytes. The service short-circuits before the metadata POST.
    expect(mockApi.recordDeliveryPhotoMetadata).not.toHaveBeenCalled();
  });

  test("rejects with a typed error when api.requestUploadUrl rejects", async () => {
    mockApi.requestUploadUrl.mockReset();
    mockApi.requestUploadUrl.mockRejectedValueOnce(new Error("rate-limited"));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { uploadDeliveryPhoto } = require("../src/services/photoService");
    await expect(
      uploadDeliveryPhoto({
        orderId: "order1",
        uri: "file://orig.jpg",
        latitude: 0,
        longitude: 0,
      }),
    ).rejects.toThrow(/rate-limited/);

    // No PUT, no metadata when the presign step fails.
    expect(mockApi.recordDeliveryPhotoMetadata).not.toHaveBeenCalled();
  });
});
