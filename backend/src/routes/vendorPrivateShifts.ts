/**
 * Revision 24 (#9) — private shifts in the merchant portal, under
 * /api/vendor/private-shifts. Registered onto the vendor portal router so the
 * portal's own identity, tab and branch fences apply unchanged; the helpers
 * are handed in rather than exported from there.
 *
 * Client note: "The vendor can open a private shift for himself ... The vendor
 * should be able to put the number of shifts needed for each branch, after
 * which the allocating function would propose a plan for him and he can
 * adjust it." On the ORDERS tab: it is about getting orders delivered.
 */
import type { Request, Response, RequestHandler, Router } from "express";
import {
  cancelPrivateShift,
  confirmPrivateShiftPlan,
  createPrivateShiftPlan,
  discardPrivateShiftPlan,
  getPrivateShiftDetail,
  getPrivateShiftPlan,
  getVendorVehiclePlans,
  listPrivateShifts,
  updatePrivateShiftPlan,
  type Scope,
} from "../services/privateShifts/privateShiftService";
import { sendPrivateShiftError } from "./privateShiftHttp";

export interface VendorPortalHelpers {
  ordersTab: RequestHandler;
  /** The roles that may place orders may plan shifts too. */
  canPlan: RequestHandler;
  scopedBranchId: (req: Request) => string | null;
}

export function registerVendorPrivateShiftRoutes(router: Router, h: VendorPortalHelpers): void {
  const scopeOf = (req: Request): Scope => ({
    kind: "VENDOR",
    vendorId: req.user!.vendorId!,
    branchId: h.scopedBranchId(req),
  });
  const q = (req: Request, key: string) =>
    typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;

  router.get("/private-shifts", h.ordersTab, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const [list, plans] = await Promise.all([
        listPrivateShifts({ tenantId, scope: scopeOf(req), from: q(req, "from"), to: q(req, "to"), status: q(req, "status") }),
        getVendorVehiclePlans(tenantId, req.user!.vendorId!),
      ]);
      res.json({
        ...list,
        suitableVehicleTypes: plans.suitableVehicleTypes,
        hourlyRates: plans.plans.map((p) => ({ vehicleType: p.vehicleType, perHourKwd: p.perHourKwd })),
      });
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.post("/private-shifts/plans", h.ordersTab, h.canPlan, async (req: Request, res: Response) => {
    try {
      const pinned = h.scopedBranchId(req);
      const branchId = String(req.body?.branchId ?? "");
      if (pinned && branchId !== pinned) {
        res.status(403).json({ error: "You can plan shifts for your own branch only" });
        return;
      }
      const plan = await createPrivateShiftPlan({
        tenantId: req.user!.tenantId,
        vendorId: req.user!.vendorId!,
        branchId,
        vehicleType: req.body?.vehicleType,
        date: req.body?.date,
        count: req.body?.count,
        hours: req.body?.hours,
        source: "VENDOR",
        createdById: req.user!.userId,
      });
      res.status(201).json(plan);
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.get("/private-shifts/plans/:id", h.ordersTab, async (req: Request, res: Response) => {
    try {
      res.json(await getPrivateShiftPlan(req.user!.tenantId, req.params.id, scopeOf(req)));
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.put("/private-shifts/plans/:id/shifts", h.ordersTab, h.canPlan, async (req: Request, res: Response) => {
    try {
      res.json(
        await updatePrivateShiftPlan({
          tenantId: req.user!.tenantId,
          planId: req.params.id,
          scope: scopeOf(req),
          shifts: req.body?.shifts,
        }),
      );
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.post("/private-shifts/plans/:id/confirm", h.ordersTab, h.canPlan, async (req: Request, res: Response) => {
    try {
      res.json(await confirmPrivateShiftPlan(req.user!.tenantId, req.params.id, scopeOf(req)));
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.post("/private-shifts/plans/:id/discard", h.ordersTab, h.canPlan, async (req: Request, res: Response) => {
    try {
      res.json(await discardPrivateShiftPlan(req.user!.tenantId, req.params.id, scopeOf(req)));
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.get("/private-shifts/:id", h.ordersTab, async (req: Request, res: Response) => {
    try {
      res.json(await getPrivateShiftDetail(req.user!.tenantId, req.params.id, scopeOf(req)));
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.post("/private-shifts/:id/cancel", h.ordersTab, h.canPlan, async (req: Request, res: Response) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
      res.json(await cancelPrivateShift(req.user!.tenantId, req.params.id, scopeOf(req), reason));
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });
}
