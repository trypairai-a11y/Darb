import { Router, Request, Response, CookieOptions } from "express";
import { AuthService } from "../services/authService";
import { authMiddleware } from "../middleware/auth";
import { redeemInvite } from "../services/inviteService";
import { resolvePermissions } from "../services/permissionService";

const router = Router();

// Frontend and backend live on different *.vercel.app subdomains in production,
// so the refresh cookie must be SameSite=None; Secure for the browser to send
// it on cross-site XHR. In dev (http://localhost) we keep Lax + non-secure.
// Check VERCEL_ENV in addition to NODE_ENV — NODE_ENV isn't always "production"
// on Vercel's @vercel/node runtime, but VERCEL_ENV is reliable.
const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_ENV === "preview";
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// `POST /api/auth/register` was removed (security review, 2026-08).
//
// It was public, took `tenantId` and `role` straight from the request body and
// wrote them into the User row, so anyone who could read a tenant id — every
// portal user can, it is a claim in their own JWT — could mint themselves an
// ADMIN and sign in with it. ADMIN is never gated by requireSurface, so that
// was the whole tenant: wallets, orders, merchants, fleets.
//
// Staff accounts are created at POST /api/users (ADMIN only, invite-based, no
// admin-set password), which is where they belonged all along. Nothing in this
// repository called this route.

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Access token and user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 user: { type: object, properties: { id: { type: string }, email: { type: string }, role: { type: string }, tenantId: { type: string } } }
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

router.post("/login-otp", async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    const result = await AuthService.sendOtp(phone);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;
    const result = await AuthService.verifyOtp(phone, code);
    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/demo:
 *   post:
 *     tags: [Auth]
 *     summary: Login as demo user (no credentials required)
 *     security: []
 *     responses:
 *       200:
 *         description: Demo access token and user
 */
router.post("/demo", async (_req: Request, res: Response) => {
  try {
    // Credential-free sign-in, so it is off unless somebody deliberately turns
    // it on. It used to be reachable in production, where it handed an ADMIN
    // access token and a 7-day refresh cookie to an empty POST body.
    if (process.env.DEMO_LOGIN_ENABLED !== "true") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result = await AuthService.demoLogin();
    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token using httpOnly refresh cookie
 *     security: []
 *     responses:
 *       200:
 *         description: New access token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *       401:
 *         description: Missing or invalid refresh token
 */
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) { res.status(401).json({ error: "No refresh token" }); return; }
    const result = await AuthService.refreshToken(token);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and clear refresh token cookie
 *     security: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post("/logout", (_req: Request, res: Response) => {
  // Match the cookie's original attributes so the browser actually clears it.
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  });
  res.json({ message: "Logged out" });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user profile
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Not authenticated
 *   put:
 *     tags: [Auth]
 *     summary: Update current user profile
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: Updated user profile
 */
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getMe(req.user!.userId);
    // Revision 4 (#12) — the rail reads this to hide surfaces the person has
    // no access to. The API enforces the same map via requireSurface, so a
    // hidden screen is also an unreachable endpoint, not just an invisible one.
    const permissions = await resolvePermissions(req.user!.tenantId, req.user!.userId);
    res.json({ ...user, permissions });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/set-password:
 *   post:
 *     tags: [Auth]
 *     summary: Redeem a staff invite and set your own password
 *     security: []
 *     description: >
 *       Revision 4 (#12). Public by necessity — the caller has no session yet;
 *       the invite token is the credential. Single use, 72 hour expiry.
 */
router.post("/set-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) {
      res.status(400).json({ error: "token and password are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const result = await redeemInvite(token, password);
    if (!result.ok) {
      // One message for every failure mode: a caller probing tokens learns
      // nothing about which ones exist.
      res.status(400).json({ error: "This invite link is no longer valid", reason: result.reason });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await AuthService.updateMe(req.user!.userId, req.body);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
