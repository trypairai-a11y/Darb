/**
 * Foodics API client (plan §A6) — thin fetch wrapper.
 *
 * Base URLs (env, sandbox defaults):
 *   FOODICS_API_BASE     — default https://api-sandbox.foodics.com/v5
 *   FOODICS_CONSOLE_BASE — default https://console-sandbox.foodics.com
 *   FOODICS_TOKEN_URL    — optional override; otherwise derived as
 *                          {origin of FOODICS_API_BASE}/oauth/token
 *
 * Auth: bearer token decrypted from FoodicsConnection.accessTokenEnc. The
 * encrypted blob stores a JSON ENVELOPE {accessToken, businessId?, ...} —
 * the schema has no foodicsBusinessId column, so business identity rides
 * inside the encrypted envelope (plain-string blobs are tolerated too).
 *
 * Errors: FoodicsApiError (status + body), FoodicsAuthError on 401 — the
 * connection-based helpers mark the FoodicsConnection status ERROR on 401
 * so ops sees a broken integration instead of a silent retry storm.
 */
import { logger } from "../../config/logger";
import { prisma } from "../../config";
import { decryptToken } from "./crypto";

const DEFAULT_API_BASE = "https://api-sandbox.foodics.com/v5";
const DEFAULT_CONSOLE_BASE = "https://console-sandbox.foodics.com";
const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Env accessors (read lazily so tests can override per-case) ────────────

export function getFoodicsApiBase(): string {
  return (process.env.FOODICS_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export function getFoodicsConsoleBase(): string {
  return (process.env.FOODICS_CONSOLE_BASE || DEFAULT_CONSOLE_BASE).replace(/\/+$/, "");
}

/** OAuth token endpoint — NOT under /v5; lives at the API origin. */
export function getFoodicsTokenUrl(): string {
  if (process.env.FOODICS_TOKEN_URL) return process.env.FOODICS_TOKEN_URL;
  return `${new URL(getFoodicsApiBase()).origin}/oauth/token`;
}

// ─── Errors ────────────────────────────────────────────────────────────────

export class FoodicsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoodicsConfigError";
  }
}

export class FoodicsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "FoodicsApiError";
  }
}

/** HTTP 401 from Foodics — token revoked/expired. */
export class FoodicsAuthError extends FoodicsApiError {
  constructor(message: string, body?: unknown) {
    super(message, 401, body);
    this.name = "FoodicsAuthError";
  }
}

// ─── Token envelope ────────────────────────────────────────────────────────

export interface FoodicsTokenEnvelope {
  accessToken: string;
  businessId?: string | null;
  businessName?: string | null;
  obtainedAt?: string;
  /** ISO timestamp when the token expires (Foodics tokens are long-lived). */
  expiresAt?: string | null;
}

export interface FoodicsConnectionLike {
  id: string;
  tenantId: string;
  accessTokenEnc: string | null;
}

/**
 * Decrypt accessTokenEnc → envelope. Accepts both the JSON envelope written
 * by oauth.handleCallback and a bare token string (defensive).
 */
export function decryptConnectionToken(
  connection: Pick<FoodicsConnectionLike, "accessTokenEnc">,
): FoodicsTokenEnvelope {
  if (!connection.accessTokenEnc) {
    throw new FoodicsConfigError("Foodics connection has no stored access token");
  }
  const plaintext = decryptToken(connection.accessTokenEnc);
  if (plaintext.startsWith("{")) {
    try {
      const parsed = JSON.parse(plaintext) as FoodicsTokenEnvelope;
      if (parsed && typeof parsed.accessToken === "string") return parsed;
    } catch {
      // fall through to bare-token handling
    }
  }
  return { accessToken: plaintext };
}

// ─── Raw fetch (token in hand — used by OAuth before a connection exists) ──

export interface FoodicsFetchOptions {
  timeoutMs?: number;
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Perform one JSON request against the Foodics API with a raw bearer token.
 * `path` is joined onto FOODICS_API_BASE unless it is already absolute.
 */
export async function foodicsFetchWithToken<T = unknown>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: FoodicsFetchOptions = {},
): Promise<T> {
  const url = /^https?:\/\//.test(path) ? path : `${getFoodicsApiBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FoodicsApiError(
      `Foodics request failed (${method} ${path}): ${message}`,
      null,
    );
  } finally {
    clearTimeout(timeout);
  }

  const parsed = await parseJsonSafe(res);
  if (res.status === 401) {
    throw new FoodicsAuthError(`Foodics rejected the token (401) on ${method} ${path}`, parsed);
  }
  if (!res.ok) {
    throw new FoodicsApiError(
      `Foodics API error ${res.status} on ${method} ${path}`,
      res.status,
      parsed,
    );
  }
  return parsed as T;
}

// ─── Connection-based helpers ──────────────────────────────────────────────

/**
 * Mark the connection ERROR after a 401 — best-effort, never throws.
 * updateMany keyed by {id, tenantId} to satisfy the tenant guard.
 */
async function markConnectionError(connection: FoodicsConnectionLike): Promise<void> {
  try {
    await prisma.foodicsConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: { status: "ERROR" },
    });
    logger.warn(
      { connectionId: connection.id },
      "foodics: 401 from API — connection marked ERROR (re-connect required)",
    );
  } catch (err) {
    logger.error({ err, connectionId: connection.id }, "foodics: failed to mark connection ERROR");
  }
}

async function foodicsRequest<T = unknown>(
  connection: FoodicsConnectionLike,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: FoodicsFetchOptions = {},
): Promise<T> {
  const envelope = decryptConnectionToken(connection);
  try {
    return await foodicsFetchWithToken<T>(envelope.accessToken, method, path, body, options);
  } catch (err) {
    if (err instanceof FoodicsAuthError) {
      await markConnectionError(connection);
    }
    throw err;
  }
}

export function foodicsGet<T = unknown>(
  connection: FoodicsConnectionLike,
  path: string,
  options?: FoodicsFetchOptions,
): Promise<T> {
  return foodicsRequest<T>(connection, "GET", path, undefined, options);
}

export function foodicsPost<T = unknown>(
  connection: FoodicsConnectionLike,
  path: string,
  body: unknown,
  options?: FoodicsFetchOptions,
): Promise<T> {
  return foodicsRequest<T>(connection, "POST", path, body, options);
}

export function foodicsPut<T = unknown>(
  connection: FoodicsConnectionLike,
  path: string,
  body: unknown,
  options?: FoodicsFetchOptions,
): Promise<T> {
  return foodicsRequest<T>(connection, "PUT", path, body, options);
}
