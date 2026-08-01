/**
 * Public wallet top-up surface (revision 10, #2). Mounted at /api/pay BEFORE
 * authMiddleware; the 128-bit top-up token is the only credential, exactly as
 * the tracking link works.
 *
 * Response discipline mirrors /api/track: an unknown token is a plain 404 with
 * no enumeration signal, and the payload is a strict safe subset — the amount,
 * the reference, whose shop it is and whether it has been paid. Never the
 * vendor's balance, never their orders, never anything about their credit line.
 *
 * The confirm route is the merchant saying "I have paid" on the manual rail. It
 * does NOT credit the wallet: only Darb confirming receipt does that, either by
 * hand from the Money screen or through the gateway webhook. Otherwise the
 * button would be a way to mint balance.
 */
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { readTopUpByToken } from "../services/wallet/topUpService";
import { readFleetDepositByToken } from "../services/wallet/fleetCashService";

const router = Router();

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /api/pay/{token}:
 *   get:
 *     tags: [Public]
 *     summary: What one top-up link is for (amount, reference, shop, status)
 */
router.get("/:token", readLimiter, async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    // Cheap shape check before touching the database, so a scan of short
    // guesses costs nothing.
    if (!/^[a-f0-9]{32}$/i.test(token)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const topUp = await readTopUpByToken(token);
    if (topUp) {
      res.json({
        kind: "TOP_UP",
        reference: topUp.reference,
        amountKwd: topUp.amountKwd,
        status: topUp.status,
        payerName: topUp.vendorName,
        vendorName: topUp.vendorName,
        vendorCode: topUp.vendorCode,
        // Present only when a real gateway issued a checkout page. The
        // Darb-hosted page redirects to it; with no gateway configured this is
        // null and the page shows the transfer reference instead of a dead
        // redirect.
        gatewayUrl: topUp.gatewayUrl,
      });
      return;
    }

    /**
     * Revision 14b — a delivery company's cash deposit rides the same link.
     *
     * One public surface for both, because a payment page that only knows about
     * shops means a second page to build, secure and rate-limit the day fleets
     * pay the same way. The token namespaces are disjoint (both 128-bit random)
     * so the order of these two lookups is a preference, not a correctness
     * question. A miss on both is the same flat 404 either way: nothing here
     * tells a scanner which kind of token it nearly guessed.
     */
    const deposit = await readFleetDepositByToken(token);
    if (deposit) {
      res.json({
        kind: "FLEET_DEPOSIT",
        reference: deposit.reference,
        amountKwd: deposit.amountKwd,
        status: deposit.status,
        payerName: deposit.payerName,
        // The page reads this for the heading; keeping the old key filled means
        // an older cached bundle still renders a name rather than a blank.
        vendorName: deposit.payerName,
        vendorCode: null,
        gatewayUrl: deposit.gatewayUrl,
      });
      return;
    }

    res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
