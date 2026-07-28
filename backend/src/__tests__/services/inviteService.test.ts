/**
 * Staff invites — revision 4 (#12).
 *
 * The client asked that a user create their own password. That turns an invite
 * link into a credential, so the properties worth pinning are the ones that
 * keep it from being a weak one: the raw token is never stored, it works once,
 * and it stops working when it expires.
 */
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.userInvite = prisma.userInvite ?? {};
for (const fn of ["findFirst", "create", "updateMany"]) {
  prisma.userInvite[fn] = prisma.userInvite[fn] ?? jest.fn();
}
prisma.user = prisma.user ?? {};
prisma.user.updateMany = prisma.user.updateMany ?? jest.fn();

jest.mock("../../services/notificationChannels", () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: false, provider: "stub" }),
}));
const { sendEmail } = require("../../services/notificationChannels") as { sendEmail: jest.Mock };

const {
  createInvite,
  emailInvite,
  hashToken,
  redeemInvite,
  INVITE_TTL_MS,
} = require("../../services/inviteService");

const TENANT = "t-1";
const USER = "u-1";

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.userInvite.updateMany.mockResolvedValue({ count: 0 });
  prisma.userInvite.create.mockResolvedValue({ id: "inv-1" });
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
});

describe("createInvite", () => {
  test("stores only the hash — a database read cannot be replayed as a link", async () => {
    const invite = await createInvite({ tenantId: TENANT, userId: USER });

    const written = prisma.userInvite.create.mock.calls[0][0].data;
    expect(written.tokenHash).toBe(hashToken(invite.token));
    expect(written.tokenHash).not.toBe(invite.token);
    // The raw token appears nowhere in what was persisted.
    expect(JSON.stringify(written)).not.toContain(invite.token);
  });

  test("expires in 72 hours", async () => {
    const before = Date.now();
    const invite = await createInvite({ tenantId: TENANT, userId: USER });

    const ttl = invite.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(INVITE_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(INVITE_TTL_MS + 5_000);
  });

  test("re-inviting kills the link already sitting in someone's inbox", async () => {
    await createInvite({ tenantId: TENANT, userId: USER });

    const consumed = prisma.userInvite.updateMany.mock.calls[0][0];
    expect(consumed.where).toMatchObject({ tenantId: TENANT, userId: USER, usedAt: null });
    expect(consumed.data.usedAt).toBeInstanceOf(Date);
  });

  test("the link points at the set-password page with the token attached", async () => {
    const invite = await createInvite({ tenantId: TENANT, userId: USER });
    expect(invite.url).toContain("/set-password?token=");
    expect(invite.url).toContain(invite.token);
  });
});

describe("emailInvite", () => {
  test("a missing provider key does not fail the invite", async () => {
    sendEmail.mockResolvedValue({ ok: false, provider: "stub", error: "no provider configured" });

    const result = await emailInvite({
      email: "sara@darb.com",
      name: "Sara",
      url: "https://x/set-password?token=abc",
      expiresAt: new Date(),
    });

    // Reported honestly, not thrown — the admin still has the copyable link.
    expect(result).toMatchObject({ ok: false, provider: "stub" });
  });

  test("a throwing provider does not fail the invite either", async () => {
    sendEmail.mockRejectedValue(new Error("sendgrid down"));

    await expect(
      emailInvite({ email: "a@b.c", name: "A", url: "u", expiresAt: new Date() }),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("redeemInvite", () => {
  const live = {
    id: "inv-1",
    userId: USER,
    tenantId: TENANT,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };

  test("sets the password and spends the invite", async () => {
    prisma.userInvite.findFirst.mockResolvedValue(live);
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });

    const result = await redeemInvite("raw-token", "correct horse battery");

    expect(result).toEqual({ ok: true, userId: USER });
    // Looked up by hash, never by the raw token.
    expect(prisma.userInvite.findFirst.mock.calls[0][0].where.tokenHash).toBe(
      hashToken("raw-token"),
    );
    // The stored password is a bcrypt hash, not the password.
    const written = prisma.user.updateMany.mock.calls[0][0].data;
    expect(written.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(written.passwordHash).not.toContain("correct horse");
  });

  test("an unknown token is rejected", async () => {
    prisma.userInvite.findFirst.mockResolvedValue(null);

    await expect(redeemInvite("nope", "password123")).resolves.toEqual({
      ok: false,
      reason: "INVALID",
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test("an expired token is rejected", async () => {
    prisma.userInvite.findFirst.mockResolvedValue({
      ...live,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(redeemInvite("old", "password123")).resolves.toEqual({
      ok: false,
      reason: "EXPIRED",
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test("a token already spent is rejected", async () => {
    prisma.userInvite.findFirst.mockResolvedValue({ ...live, usedAt: new Date() });

    await expect(redeemInvite("used", "password123")).resolves.toEqual({
      ok: false,
      reason: "USED",
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test("two simultaneous redemptions: the loser sets no password", async () => {
    // Both readers see an unused invite; the guarded updateMany decides.
    prisma.userInvite.findFirst.mockResolvedValue(live);
    prisma.userInvite.updateMany.mockResolvedValue({ count: 0 });

    await expect(redeemInvite("raced", "password123")).resolves.toEqual({
      ok: false,
      reason: "USED",
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
