import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma, redis, env } from "../config";
import { JwtPayload } from "../middleware/auth";

export class AuthService {
  static generateAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
  }

  static generateRefreshToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  }

  static async register(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    tenantId: string;
    role?: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error("Email already registered");

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        tenantId: data.tenantId,
        role: (data.role as any) || "VIEWER",
      },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    return user;
  }

  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { vendor: { select: { id: true, name: true } } },
    });
    if (!user || !user.isActive) throw new Error("Invalid credentials");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error("Invalid credentials");

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      ...(user.vendorId ? { vendorId: user.vendorId } : {}),
      ...(user.vendorRole ? { vendorRole: user.vendorRole } : {}),
      ...(user.branchId ? { branchId: user.branchId } : {}),
      ...(user.fleetPartnerId ? { fleetPartnerId: user.fleetPartnerId } : {}),
      ...(user.ownerGroupId ? { ownerGroupId: user.ownerGroupId } : {}),
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId,
        vendorId: user.vendorId,
        vendorRole: user.vendorRole,
        branchId: user.branchId,
        fleetPartnerId: user.fleetPartnerId,
        ownerGroupId: user.ownerGroupId,
        ...(user.vendorId && user.vendor ? { vendor: user.vendor } : {}),
      },
    };
  }

  static async sendOtp(phone: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (redis) {
      await redis.set(`otp:${phone}`, code, "EX", 300);
    }
    console.log(`[DEV] OTP for ${phone}: ${code}`);
    return { message: "OTP sent" };
  }

  static async verifyOtp(phone: string, code: string) {
    const stored = redis ? await redis.get(`otp:${phone}`) : null;
    if (!stored || stored !== code) throw new Error("Invalid or expired OTP");

    if (redis) await redis.del(`otp:${phone}`);

    const user = await prisma.user.findFirst({
      where: { phone },
      include: { vendor: { select: { id: true, name: true } } },
    });
    if (!user) throw new Error("User not found");

    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      ...(user.vendorId ? { vendorId: user.vendorId } : {}),
      ...(user.vendorRole ? { vendorRole: user.vendorRole } : {}),
      ...(user.branchId ? { branchId: user.branchId } : {}),
      ...(user.fleetPartnerId ? { fleetPartnerId: user.fleetPartnerId } : {}),
      ...(user.ownerGroupId ? { ownerGroupId: user.ownerGroupId } : {}),
    };

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId,
        vendorId: user.vendorId,
        vendorRole: user.vendorRole,
        branchId: user.branchId,
        fleetPartnerId: user.fleetPartnerId,
        ownerGroupId: user.ownerGroupId,
        ...(user.vendorId && user.vendor ? { vendor: user.vendor } : {}),
      },
    };
  }

  static async refreshToken(token: string) {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) throw new Error("Invalid refresh token");

    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      ...(user.vendorId ? { vendorId: user.vendorId } : {}),
      ...(user.vendorRole ? { vendorRole: user.vendorRole } : {}),
      ...(user.branchId ? { branchId: user.branchId } : {}),
      ...(user.fleetPartnerId ? { fleetPartnerId: user.fleetPartnerId } : {}),
      ...(user.ownerGroupId ? { ownerGroupId: user.ownerGroupId } : {}),
    };

    return { accessToken: this.generateAccessToken(payload) };
  }

  static async demoLogin() {
    // Prefer the seeded admin user which is always in the correct tenant with data
    let user = await prisma.user.findUnique({ where: { email: "osama@fleet.kw" } });

    if (!user) {
      // Fallback: find tenant with the most drivers (the real seeded one)
      const tenant = await prisma.tenant.findFirst({
        where: { name: "Osama Fleet Management" },
        include: { _count: { select: { drivers: true } } },
        orderBy: { drivers: { _count: "desc" } },
      }) || await prisma.tenant.create({
        data: { name: "Demo Fleet", subscriptionPlan: "FREE" },
      });

      const passwordHash = await bcrypt.hash("demo123", 12);
      user = await prisma.user.create({
        data: {
          email: "demo@fleet.kw",
          passwordHash,
          name: "Demo User",
          tenantId: tenant.id,
          role: "ADMIN",
          isActive: true,
        },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      ...(user.vendorId ? { vendorId: user.vendorId } : {}),
      ...(user.vendorRole ? { vendorRole: user.vendorRole } : {}),
      ...(user.branchId ? { branchId: user.branchId } : {}),
      ...(user.fleetPartnerId ? { fleetPartnerId: user.fleetPartnerId } : {}),
      ...(user.ownerGroupId ? { ownerGroupId: user.ownerGroupId } : {}),
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId,
        vendorId: user.vendorId,
      },
    };
  }

  static async getMe(userId: string) {
    // Phase 2 Wave 5 — surface isSuperAdmin so the frontend SidebarV2 can
    // conditionally render the Admin footer section + the admin route
    // pages can graceful-degrade for non-super-admins. The backend gate
    // for /api/admin/* routes lives in middleware/superAdmin.ts which
    // re-reads the User row from DB on every request (T-02-06 — never
    // trust the JWT for the flag).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        tenantId: true, isActive: true, isSuperAdmin: true, lastLoginAt: true,
        tenant: { select: { id: true, name: true, subscriptionPlan: true } },
        // Darb 2.0 — vendor identity for role=VENDOR portal users.
        vendorId: true,
        vendor: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new Error("User not found");
    // Keep the payload lean for staff users: only surface `vendor` when set.
    if (!user.vendorId) {
      const { vendor: _vendor, ...rest } = user;
      return { ...rest, vendorId: null };
    }
    return user;
  }

  static async updateMe(userId: string, data: { name?: string; email?: string; phone?: string; password?: string }) {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.phone) updateData.phone = data.phone;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);

    return prisma.user.update({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, role: true },
      data: updateData,
    });
  }
}
