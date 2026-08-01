/**
 * Cloudflare R2 presigned URL helper (S3-compatible).
 *
 * R2 speaks the S3 wire protocol, so the `@aws-sdk/client-s3` +
 * `@aws-sdk/s3-request-presigner` combo signs URLs that R2 accepts
 * verbatim. The S3Client is constructed lazily inside `getClient()`
 * so `import "./r2Service"` does NOT crash on dev machines without
 * R2 keys — only the actual `presignPutUrl` / `presignGetUrl` call
 * fails with a clear "R2 not configured" error.
 *
 * Used by:
 *   - POST /api/agent/upload-url  → issues a short-lived PUT URL the
 *     mobile client uses to upload a delivery photo directly to R2.
 *   - (Future) signed GET URLs for ops console to view a photo.
 *
 * Security: bucket is private (no public-read policy). All access
 * flows through this service. Presigned URLs default to 5-min TTL
 * for PUT (the courier flow finishes in seconds) and 1-hour TTL for
 * GET (a dashboard tab open). Both are tight enough that an intercepted
 * URL has a narrow replay window.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Whether object storage is usable at all.
 *
 * Callers that have a fallback need to ASK rather than catch: a thrown "R2 not
 * configured" is indistinguishable from a network failure, and the two deserve
 * opposite responses. This one means "use the other store"; the other means
 * "retry".
 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function getClient(): { s3: S3Client; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 not configured: set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET",
    );
  }
  return {
    s3: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

/**
 * Sign a PUT URL the mobile client uses to upload `key` directly to R2.
 * The URL embeds `contentType` so R2 rejects mismatched MIME uploads.
 */
export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresInSec = 300,
): Promise<string> {
  const { s3, bucket } = getClient();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}

/**
 * Sign a GET URL for read access to a private R2 object.
 */
export async function presignGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  const { s3, bucket } = getClient();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}
