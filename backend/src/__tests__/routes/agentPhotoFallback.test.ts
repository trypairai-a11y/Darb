// Proof photos without object storage (2026-08-01).
//
// The failure this locks down took production down for deliveries. Removing the
// PIN left a photo as the only way to complete one, the photo path presigned a
// PUT to R2, and production has no R2 credentials. The presign threw, the app
// queued the POD forever, and no driver could finish a job.
//
// So the contract is:
//   1. With no R2, /upload-url ANSWERS (mode INLINE + a key). It must not throw,
//      because a thrown presign is what stopped the line.
//   2. The bytes can then be stored against that key.
//   3. A key outside the caller's tenant is refused, since the client reports it
//      back and could otherwise write into somebody else's namespace.
//   4. A retry upserts. The outbox replays, and a replay must not 500.

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.deliveryPhoto = prisma.deliveryPhoto ?? {
  upsert: jest.fn(), findFirst: jest.fn(),
};

jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(),
}));

import agentRouter from "../../routes/agent";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/api/agent", agentRouter);

const TENANT = "t-1";
const DRIVER = { id: "drv-1", tenantId: TENANT, name: "Abdul Rahman" };
const DEVICE = { id: "dev-1", driver: DRIVER };

// A one-pixel JPEG is enough: this suite is about the store, not the image.
const ONE_PIXEL = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a",
  "base64",
).toString("base64");

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.device.findUnique.mockResolvedValue(DEVICE);
  prisma.deliveryPhoto.upsert.mockResolvedValue({ id: "dp-1" });
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET;
});

describe("POST /api/agent/upload-url without R2", () => {
  test("answers with an inline mode instead of throwing", async () => {
    const res = await request(app)
      .post("/api/agent/upload-url")
      .send({ deviceId: "dev-1", orderId: "ord-1", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("INLINE");
    expect(res.body.url).toBeNull();
    // The key is the one R2 would have used, so switching credentials on later
    // changes where a photo lives and nothing about how it is addressed.
    expect(res.body.key).toContain(`${TENANT}/ord-1/dev-1/`);
  });
});

describe("POST /api/agent/photo-inline", () => {
  const KEY = `${TENANT}/ord-1/dev-1/123.jpg`;

  test("stores the bytes against the issued key", async () => {
    const res = await request(app).post("/api/agent/photo-inline").send({
      deviceId: "dev-1", key: KEY, orderId: "ord-1", dataBase64: ONE_PIXEL,
    });

    expect(res.status).toBe(201);
    expect(prisma.deliveryPhoto.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: KEY },
        create: expect.objectContaining({ tenantId: TENANT, orderId: "ord-1" }),
      }),
    );
  });

  test("accepts a data URL, which is what the web build produces", async () => {
    const res = await request(app).post("/api/agent/photo-inline").send({
      deviceId: "dev-1", key: KEY, orderId: "ord-1",
      dataBase64: `data:image/jpeg;base64,${ONE_PIXEL}`,
    });
    expect(res.status).toBe(201);
    const created = prisma.deliveryPhoto.upsert.mock.calls[0][0].create;
    expect(created.sizeBytes).toBeGreaterThan(0);
  });

  test("a key from another tenant is refused", async () => {
    const res = await request(app).post("/api/agent/photo-inline").send({
      deviceId: "dev-1", key: "someone-else/ord-9/dev-9/1.jpg",
      orderId: "ord-9", dataBase64: ONE_PIXEL,
    });
    expect(res.status).toBe(403);
    expect(prisma.deliveryPhoto.upsert).not.toHaveBeenCalled();
  });

  test("an empty body is refused rather than stored as a zero-byte proof", async () => {
    const res = await request(app).post("/api/agent/photo-inline").send({
      deviceId: "dev-1", key: KEY, orderId: "ord-1", dataBase64: "",
    });
    expect(res.status).toBe(400);
    expect(prisma.deliveryPhoto.upsert).not.toHaveBeenCalled();
  });

  test("no device, no write", async () => {
    prisma.device.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/agent/photo-inline").send({
      deviceId: "nope", key: KEY, orderId: "ord-1", dataBase64: ONE_PIXEL,
    });
    expect(res.status).toBe(404);
    expect(prisma.deliveryPhoto.upsert).not.toHaveBeenCalled();
  });
});
