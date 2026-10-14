/**
 * Revision 24 (#8, #10) — private shifts, staff side. Mounted at
 * /api/private-shifts.
 *
 *   GET    /                         shifts in a date range (+ draft plans)
 *   GET    /demand                   a branch's orders by hour, for the form
 *   POST   /plans                    "N shifts at this branch on this day": propose
 *   GET    /plans/:id                one plan with its shifts
 *   PUT    /plans/:id/shifts         adjust the proposed times (wholesale)
 *   POST   /plans/:id/confirm        open them to drivers
 *   POST   /plans/:id/discard        throw the draft away
 *   GET    /:id                      one shift with its money
 *   POST   /:id/cancel               withdraw a shift that has not started
 *   POST   /:id/settle               re-run the settlement of a finished shift
 *   GET|PUT /vendors/:vendorId/vehicle-plans    vehicle checkboxes + two plans each
 *   GET|PUT /fleets/:fleetId/vehicle-rates      per order + per hour, by vehicle
 *   PATCH  /drivers/:driverId/eligibility       the driver-profile checkbox
 *
 * The vehicle plan and rate endpoints live here rather than on /api/vendors
 * and /api/fleets so this feature is one router, not edits to three.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { sendPrivateShiftError } from "./privateShiftHttp";
import {
  cancelPrivateShift,
  confirmPrivateShiftPlan,
  createPrivateShiftPlan,
  discardPrivateShiftPlan,
  getFleetVehicleRates,
  getPrivateShiftDetail,
  getPrivateShiftPlan,
  getVendorVehiclePlans,
  listPrivateShifts,
  loadHourlyDemand,
  saveFleetVehicleRates,
  saveVendorVehiclePlans,
  settlePrivateShift,
  updatePrivateShiftPlan,
} from "../services/privateShifts/privateShiftService";
import { isIsoDate } from "../services/privateShifts/privateShiftProposal";

const STAFF = ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT", "ACCOUNT_MANAGER", "VIEWER"];
const PLANNERS = ["ADMIN", "OPS_MANAGER"];
const STAFF_SCOPE = { kind: "STAFF" } as const;

const router = Router();
router.use(authMiddleware, tenantScope);

const q = (req: Request, key: string) => (typeof req.query[key] === "string" ? (req.query[key] as string) : undefined);

router.get("/", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    res.json(
      await listPrivateShifts({
        tenantId: req.user!.tenantId,
        scope: STAFF_SCOPE,
        from: q(req, "from"),
        to: q(req, "to"),
        vendorId: q(req, "vendorId"),
        status: q(req, "status"),
      }),
    );
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.get("/demand", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    const branchId = q(req, "branchId");
    const date = q(req, "date");
    if (!branchId || !isIsoDate(date)) {
      res.status(400).json({ error: "branchId and date (YYYY-MM-DD) are required" });
      return;
    }
    res.json(await loadHourlyDemand(req.user!.tenantId, branchId, date));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/plans", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const plan = await createPrivateShiftPlan({
      tenantId: req.user!.tenantId,
      vendorId: String(b.vendorId ?? ""),
      branchId: String(b.branchId ?? ""),
      vehicleType: b.vehicleType,
      date: b.date,
      count: b.count,
      hours: b.hours,
      source: "ADMIN",
      createdById: req.user!.userId,
    });
    res.status(201).json(plan);
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.get("/plans/:id", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    res.json(await getPrivateShiftPlan(req.user!.tenantId, req.params.id, STAFF_SCOPE));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.put("/plans/:id/shifts", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    res.json(
      await updatePrivateShiftPlan({
        tenantId: req.user!.tenantId,
        planId: req.params.id,
        scope: STAFF_SCOPE,
        shifts: req.body?.shifts,
      }),
    );
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/plans/:id/confirm", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    res.json(await confirmPrivateShiftPlan(req.user!.tenantId, req.params.id, STAFF_SCOPE));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/plans/:id/discard", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    res.json(await discardPrivateShiftPlan(req.user!.tenantId, req.params.id, STAFF_SCOPE));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

// ── Vehicle plans (shop), vehicle rates (delivery company), eligibility ────
// Declared BEFORE /:id so Express does not read "vendors" as a shift id.

router.get("/vendors/:vendorId/vehicle-plans", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    res.json(await getVendorVehiclePlans(req.user!.tenantId, req.params.vendorId));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

// Prices, so ADMIN like the rest of /pricing.
router.put("/vendors/:vendorId/vehicle-plans", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    res.json(
      await saveVendorVehiclePlans({
        tenantId: req.user!.tenantId,
        vendorId: req.params.vendorId,
        suitableVehicleTypes: req.body?.suitableVehicleTypes,
        plans: req.body?.plans,
      }),
    );
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.get("/fleets/:fleetId/vehicle-rates", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    res.json(await getFleetVehicleRates(req.user!.tenantId, req.params.fleetId));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.put("/fleets/:fleetId/vehicle-rates", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    res.json(await saveFleetVehicleRates(req.user!.tenantId, req.params.fleetId, req.body?.rates));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.patch("/drivers/:driverId/eligibility", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const eligible = req.body?.eligible;
    if (typeof eligible !== "boolean") {
      res.status(400).json({ error: "eligible must be true or false" });
      return;
    }
    const updated = await prisma.driver.updateMany({
      where: { id: req.params.driverId, tenantId: req.user!.tenantId },
      data: { privateShiftEligible: eligible },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    res.json({ driverId: req.params.driverId, privateShiftEligible: eligible });
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.get("/drivers/:driverId/eligibility", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findFirst({
      where: { id: req.params.driverId, tenantId: req.user!.tenantId },
      select: { id: true, privateShiftEligible: true, vehicleType: true },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    res.json({ driverId: driver.id, privateShiftEligible: driver.privateShiftEligible, vehicleType: driver.vehicleType });
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

// ── One shift ──────────────────────────────────────────────────────────────

router.get("/:id", rbac(...STAFF), async (req: Request, res: Response) => {
  try {
    res.json(await getPrivateShiftDetail(req.user!.tenantId, req.params.id, STAFF_SCOPE));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/:id/cancel", rbac(...PLANNERS), async (req: Request, res: Response) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
    res.json(await cancelPrivateShift(req.user!.tenantId, req.params.id, STAFF_SCOPE, reason));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/:id/settle", rbac(...PLANNERS, "ACCOUNTANT"), async (req: Request, res: Response) => {
  try {
    const shift = await prisma.privateShift.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      select: { status: true },
    });
    if (!shift) {
      res.status(404).json({ error: "Private shift not found" });
      return;
    }
    if (shift.status !== "COMPLETED") {
      res.status(409).json({ error: "Only a finished shift can be settled", code: "NOT_COMPLETED" });
      return;
    }
    await settlePrivateShift(req.user!.tenantId, req.params.id);
    res.json(await getPrivateShiftDetail(req.user!.tenantId, req.params.id, STAFF_SCOPE));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

export default router;
