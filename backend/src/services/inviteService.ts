/**
 * Staff invites — revision 4 (#12).
 *
 * The client's note: "User should create his own password". So an admin types
 * a name, an email and a role, and never a credential. The invited person sets
 * their own, once, from a link that expires.
 *
 * Only the sha256 of the token is stored, so a database read cannot be
 * replayed as an invite. The raw token exists exactly once, in the response to
 * the admin who created it and in the email we send.
 */
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { sendEmail } from "./notificationChannels";

/** 72 hours. Long enough for a weekend, short enough to matter. */
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function baseUrl(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_TRACKING_BASE_URL ||
    "https://frontend-ebon-nine-34.vercel.app"
  ).replace(/\/$/, "");
}

export function inviteUrl(token: string): string {
  return `${baseUrl()}/set-password?token=${token}`;
}

/**
 * Issue an invite for an existing user row. Any earlier unused invite for that
 * user is consumed first, so a re-invite invalidates the link already in
 * someone's inbox rather than leaving two live credentials.
 */
export async function createInvite(args: {
  tenantId: string;
  userId: string;
}): Promise<{ token: string; url: string; expiresAt: Date }> {
  const { tenantId, userId } = args;
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await prisma.userInvite.updateMany({
    where: { tenantId, userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.userInvite.create({
    data: { tenantId, userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, url: inviteUrl(token), expiresAt };
}

/**
 * Email the invite. Never throws: until a provider key is configured this
 * stub-warns, and the admin still has the copyable link, so a missing
 * SENDGRID_API_KEY must not fail the invite itself.
 */
export async function emailInvite(args: {
  email: string;
  name: string;
  url: string;
  expiresAt: Date;
}): Promise<{ ok: boolean; provider: string }> {
  try {
    const result = await sendEmail(
      args.email,
      "Your Darb account",
      [
        `Hello ${args.name},`,
        "",
        "An account has been created for you on Darb. Choose your password here:",
        args.url,
        "",
        `This link stops working on ${args.expiresAt.toUTCString()}.`,
      ].join("\n"),
    );
    return { ok: result.ok, provider: result.provider };
  } catch (err) {
    logger.warn({ err }, "emailInvite: send failed, the copyable link still works");
    return { ok: false, provider: "none" };
  }
}

export type RedeemFailure = "INVALID" | "EXPIRED" | "USED";

/**
 * Spend an invite and set the password. Single use is enforced by a guarded
 * updateMany on usedAt — count 0 means someone already redeemed it, which is
 * the same compare-and-set shape the order state machine uses.
 */
export async function redeemInvite(
  token: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: RedeemFailure }> {
  const invite = await prisma.userInvite.findFirst({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, tenantId: true, expiresAt: true, usedAt: true },
  });
  if (!invite) return { ok: false, reason: "INVALID" };
  if (invite.usedAt) return { ok: false, reason: "USED" };
  if (invite.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "EXPIRED" };

  const passwordHash = await bcrypt.hash(password, 12);

  const claimed = await prisma.userInvite.updateMany({
    where: { id: invite.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "USED" };

  await prisma.user.updateMany({
    where: { id: invite.userId, tenantId: invite.tenantId },
    data: { passwordHash, isActive: true },
  });

  return { ok: true, userId: invite.userId };
}
