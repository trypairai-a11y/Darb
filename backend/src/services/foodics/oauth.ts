/**
 * Foodics OAuth2 code-grant flow (plan §A6).
 *
 *   buildAuthorizeUrl(tenantId, vendorId)
 *     → {FOODICS_CONSOLE_BASE}/authorize?client_id=…&state=…
 *       state = signed JWT {tenantId, vendorId, nonce} exp 10m (JWT_SECRET) —
 *       the callback trusts ONLY this state for tenant/vendor identity.
 *
 *   handleCallback(code, state)
 *     → verify state → POST token exchange → GET /whoami + /branches →
 *       upsert FoodicsConnection (encrypted token ENVELOPE incl. business id,
 *       status CONNECTED, webhookSecret generated once) → best-effort
 *       ensureOrderTag → return {connection, branches} for branch mapping.
 *
 * Env: FOODICS_CLIENT_ID, FOODICS_CLIENT_SECRET, FOODICS_REDIRECT_URI
 * (+ client.ts base URLs). JWT_SECRET is reused for the state JWT.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { FoodicsConnection } from "../../generated/prisma";
import { env, prisma } from "../../config";
import { logger } from "../../config/logger";
import { encryptToken } from "./crypto";
import {
  FoodicsConfigError,
  FoodicsTokenEnvelope,
  foodicsFetchWithToken,
  foodicsPost,
  foodicsGet,
  getFoodicsConsoleBase,
  getFoodicsTokenUrl,
} from "./client";

const STATE_TTL = "10m";
const STATE_PURPOSE = "foodics_oauth";
const ORDER_TAG_NAME = "Darb";

export interface FoodicsOauthState {
  tenantId: string;
  vendorId: string;
  nonce: string;
  purpose: string;
}

export interface FoodicsBranchSummary {
  foodicsBranchId: string;
  name: string | null;
  nameAr: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  address: string | null;
}

export interface FoodicsCallbackResult {
  connection: FoodicsConnection;
  foodicsBusinessId: string | null;
  branches: FoodicsBranchSummary[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function requireEnv(name: "FOODICS_CLIENT_ID" | "FOODICS_CLIENT_SECRET" | "FOODICS_REDIRECT_URI"): string {
  const value = process.env[name];
  if (!value) {
    throw new FoodicsConfigError(`${name} is not set — required for the Foodics OAuth flow`);
  }
  return value;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ─── State JWT ─────────────────────────────────────────────────────────────

/** Signed, short-lived state binding the OAuth round-trip to tenant+vendor. */
export function signState(tenantId: string, vendorId: string): string {
  return jwt.sign(
    {
      tenantId,
      vendorId,
      nonce: crypto.randomBytes(8).toString("hex"),
      purpose: STATE_PURPOSE,
    },
    env.JWT_SECRET,
    { expiresIn: STATE_TTL },
  );
}

/** Verify + decode the state JWT. Throws on tamper/expiry/wrong purpose. */
export function verifyState(state: string): FoodicsOauthState {
  const decoded = jwt.verify(state, env.JWT_SECRET) as FoodicsOauthState;
  if (decoded.purpose !== STATE_PURPOSE || !decoded.tenantId || !decoded.vendorId) {
    throw new Error("Invalid Foodics OAuth state");
  }
  return decoded;
}

// ─── Authorize URL ─────────────────────────────────────────────────────────

/**
 * Console authorize URL for the vendor's Foodics account owner to approve.
 * Per Foodics docs the redirect URI is registered on the partner app, so it
 * is not a query parameter here (re-verify against sandbox — see checklist).
 */
export function buildAuthorizeUrl(tenantId: string, vendorId: string): string {
  const clientId = requireEnv("FOODICS_CLIENT_ID");
  const state = signState(tenantId, vendorId);
  const qs = new URLSearchParams({ client_id: clientId, state });
  return `${getFoodicsConsoleBase()}/authorize?${qs.toString()}`;
}

// ─── Token exchange + connection upsert ────────────────────────────────────

interface FoodicsTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Exchange the authorization code (no auth header on the token endpoint).
 */
async function exchangeCode(code: string): Promise<FoodicsTokenResponse> {
  const body = {
    grant_type: "authorization_code",
    client_id: requireEnv("FOODICS_CLIENT_ID"),
    client_secret: requireEnv("FOODICS_CLIENT_SECRET"),
    redirect_uri: requireEnv("FOODICS_REDIRECT_URI"),
    code,
  };
  const url = getFoodicsTokenUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as FoodicsTokenResponse | null;
  if (!res.ok || !parsed?.access_token) {
    throw new FoodicsConfigError(
      `Foodics token exchange failed (HTTP ${res.status}) — check client id/secret/redirect_uri`,
    );
  }
  return parsed;
}

/**
 * Complete the OAuth callback: verify state, exchange the code, snapshot
 * business identity + branches, and upsert the FoodicsConnection.
 *
 * NOTE: the schema has no foodicsBusinessId / tokenExpiresAt columns —
 * both live inside the encrypted token ENVELOPE (client.decryptConnectionToken).
 */
export async function handleCallback(code: string, state: string): Promise<FoodicsCallbackResult> {
  const { tenantId, vendorId } = verifyState(state);

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { id: true },
  });
  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found for tenant — refusing to connect Foodics`);
  }

  const token = await exchangeCode(code);
  const accessToken = token.access_token as string;

  // Business identity — /whoami response shape re-verified against sandbox.
  let businessId: string | null = null;
  let businessName: string | null = null;
  try {
    const whoami = await foodicsFetchWithToken<{ data?: { business?: { id?: unknown; name?: unknown; reference?: unknown } } }>(
      accessToken,
      "GET",
      "/whoami",
    );
    businessId =
      asString(whoami?.data?.business?.id) ?? asString(whoami?.data?.business?.reference);
    businessName = asString(whoami?.data?.business?.name);
  } catch (err) {
    logger.warn({ err, vendorId }, "foodics oauth: /whoami failed — connecting without business id");
  }

  // Branches — returned to the portal for foodicsBranchId → VendorBranch mapping.
  let branches: FoodicsBranchSummary[] = [];
  try {
    const branchesRes = await foodicsFetchWithToken<{ data?: Array<Record<string, unknown>> }>(
      accessToken,
      "GET",
      "/branches",
    );
    branches = (branchesRes?.data ?? []).flatMap((b) => {
      const id = asString(b.id);
      if (!id) return [];
      return [{
        foodicsBranchId: id,
        name: asString(b.name),
        nameAr: asString(b.name_localized),
        latitude: asNumber(b.latitude),
        longitude: asNumber(b.longitude),
        phone: asString(b.phone),
        address: asString(b.address),
      }];
    });
  } catch (err) {
    logger.warn({ err, vendorId }, "foodics oauth: /branches failed — connection continues without branch list");
  }

  const envelope: FoodicsTokenEnvelope = {
    accessToken,
    businessId,
    businessName,
    obtainedAt: new Date().toISOString(),
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
  };
  const accessTokenEnc = encryptToken(JSON.stringify(envelope));

  // webhookSecret is generated ONCE (create only) so the webhook URL a vendor
  // registered on the Foodics console survives re-connects.
  const connection = await prisma.foodicsConnection.upsert({
    where: { vendorId },
    create: {
      tenantId,
      vendorId,
      accessTokenEnc,
      webhookSecret: crypto.randomBytes(24).toString("hex"),
      status: "CONNECTED",
    },
    update: {
      accessTokenEnc,
      status: "CONNECTED",
    },
  });

  await ensureOrderTag(connection);

  const fresh = await prisma.foodicsConnection.findFirst({
    where: { id: connection.id, tenantId },
  });

  return { connection: fresh ?? connection, foodicsBusinessId: businessId, branches };
}

// ─── Order tag ─────────────────────────────────────────────────────────────

/**
 * Find-or-create the "Darb" order tag and store its id on the connection.
 * Only orders carrying this tag are ingested (eligibility filter in the
 * worker). The tags API shape varies across Foodics versions, so the whole
 * thing is best-effort: on ANY failure we store null and log — a null
 * orderTagId makes the eligibility check pass-through (ingest everything).
 */
export async function ensureOrderTag(
  connection: Pick<FoodicsConnection, "id" | "tenantId" | "accessTokenEnc">,
): Promise<string | null> {
  let tagId: string | null = null;
  try {
    // 1) Look for an existing tag named "Darb".
    const found = await foodicsGet<{ data?: Array<{ id?: unknown; name?: unknown }> }>(
      connection,
      `/tags?filter[name]=${encodeURIComponent(ORDER_TAG_NAME)}`,
    );
    const match = (found?.data ?? []).find((t) => asString(t.name) === ORDER_TAG_NAME);
    tagId = match ? asString(match.id) : null;

    // 2) Create it when absent.
    if (!tagId) {
      const created = await foodicsPost<{ data?: { id?: unknown } }>(connection, "/tags", {
        name: ORDER_TAG_NAME,
      });
      tagId = asString(created?.data?.id);
    }
  } catch (err) {
    logger.warn(
      { err, connectionId: connection.id },
      "foodics: order-tag setup failed — storing null orderTagId (eligibility passes through)",
    );
    tagId = null;
  }

  try {
    await prisma.foodicsConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: { orderTagId: tagId },
    });
  } catch (err) {
    logger.warn({ err, connectionId: connection.id }, "foodics: failed to persist orderTagId");
  }
  return tagId;
}
