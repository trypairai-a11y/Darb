/**
 * /api/onboarding — revision 20, the Ops tab's "new vendors / delivery
 * companies" subtab.
 *
 * "this tab is for the sales team to add the requests to create new vendor
 * accounts or delivery companies accounts".
 *
 * Note the split in who may do what. RAISING a lead is open to every staff
 * role including VIEWER, because the sales team is not in the ops hierarchy
 * and the whole feature is pointless if a rep has to ask somebody else to type
 * it in. DECIDING is OPS_MANAGER and above, because approval is what writes a
 * live `Vendor` or `FleetPartner` row.
 */
import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import {
  approveOnboardingRequest,
  createOnboardingRequest,
  listOnboardingRequests,
  markOnboardingInReview,
  onboardingCounts,
  rejectOnboardingRequest,
  updateOnboardingRequest,
} from "../services/onboarding/onboardingRequestService";

const DECIDE = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

function fail(res: Response, err: unknown) {
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  res.status(status).json({ error: err instanceof Error ? err.message : "Request failed" });
}

router.get("/counts", async (req: Request, res: Response) => {
  try {
    res.json(await onboardingCounts(req.user!.tenantId));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    res.json({
      data: await listOnboardingRequests({
        tenantId: req.user!.tenantId,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        type: req.query.type === "VENDOR" || req.query.type === "FLEET" ? req.query.type : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
      }),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { type } = req.body ?? {};
    if (type !== "VENDOR" && type !== "FLEET") {
      res.status(400).json({ error: "type must be VENDOR or FLEET" });
      return;
    }
    const created = await createOnboardingRequest({
      tenantId: req.user!.tenantId,
      type,
      companyName: String(req.body?.companyName ?? ""),
      companyNameAr: req.body?.companyNameAr ?? null,
      code: req.body?.code ?? null,
      contactName: req.body?.contactName ?? null,
      contactPhone: req.body?.contactPhone ?? null,
      contactEmail: req.body?.contactEmail ?? null,
      notes: req.body?.notes ?? null,
      ...(req.body?.details !== undefined ? { details: req.body.details } : {}),
      createdById: req.user!.userId,
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    res.json(
      await updateOnboardingRequest({
        tenantId: req.user!.tenantId,
        id: req.params.id,
        patch: req.body ?? {},
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post("/:id/claim", rbac(...DECIDE), async (req: Request, res: Response) => {
  try {
    res.json(await markOnboardingInReview(req.user!.tenantId, req.params.id, req.user!.userId));
  } catch (err) {
    fail(res, err);
  }
});

/** Approval creates the account. See the service for why it is one transaction. */
router.post("/:id/approve", rbac(...DECIDE), async (req: Request, res: Response) => {
  try {
    res.json(
      await approveOnboardingRequest({
        tenantId: req.user!.tenantId,
        id: req.params.id,
        reviewerId: req.user!.userId,
        note: typeof req.body?.note === "string" ? req.body.note : null,
        code: typeof req.body?.code === "string" ? req.body.code : null,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post("/:id/reject", rbac(...DECIDE), async (req: Request, res: Response) => {
  try {
    res.json(
      await rejectOnboardingRequest({
        tenantId: req.user!.tenantId,
        id: req.params.id,
        reviewerId: req.user!.userId,
        reason: String(req.body?.reason ?? ""),
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

export default router;
