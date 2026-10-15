/**
 * reset-staff-password.ts — give one existing account a new random password.
 *
 * There is no "forgot password" page, and staff accounts are invite-only, so
 * this is how the account owner gets back in. It changes ONE row: the
 * passwordHash of the user with the given email. The new password is printed
 * once to this terminal and stored nowhere else.
 *
 *   cd backend
 *   npx tsx scripts/reset-staff-password.ts --email=someone@example.com 2>&1 | grep "^RESET"
 *
 * Reads DATABASE_URL from the environment. Uses its own Prisma client rather
 * than src/config, so it does not connect to Redis.
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--email="));
  const email = arg?.slice("--email=".length).trim();
  if (!email) {
    console.log("RESET error: pass --email=<address>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!user) {
    console.log(`RESET error: no user with email ${email}`);
    process.exitCode = 1;
    return;
  }

  // 16 characters from an unambiguous alphabet, easy to read off a screen.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  const password = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log(`RESET done for ${user.email} (${user.role})`);
  console.log(`RESET new password: ${password}`);
  if (!user.isActive) console.log("RESET warning: this account is switched off, sign-in will still fail");
}

main()
  .catch((err) => {
    console.log(`RESET error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
