/**
 * Revision 24 (#10) — the delivery company's side of private shifts, under
 * /api/fleet. Registered onto the fleet portal router so its identity, tab
 * and company fences apply unchanged; the helpers are handed in.
 *
 *   GET    /vehicle-rates          per order + per hour, for each vehicle type,
 *                                  and the company's pending ask if any
 *   POST   /vehicle-rates          propose new ones (a RATE_CHANGE request; Darb
 *                                  approves, the portal never writes a rate live)
 *   GET    /private-shifts         shifts the company's drivers booked, with money
 *   GET    /private-shifts/:id     one of them, with its deductions
 *
 * Client note: "For the delivery company, they will also have two plans, per
 * order and per hour, for each type of vehicle they offer." Integrated with
 * revision 23's commercial model rather than beside it: on MARGIN the per
 * order rate for a vehicle falls back to the company's base fee when blank;
 * on SUBSCRIPTION per-order pay is the shop's fee, so only the hourly rate
 * means anything there. The hourly rate pays private shifts under either.
 */
import type { Request, Response, RequestHandler, Router } from "express";
import { prisma } from "../config";
import {
  getFleetVehicleRates,
  getPrivateShiftDetail,
  listPrivateShifts,
  parseFleetVehicleRates,
} from "../services/privateShifts/privateShiftService";
import { createFleetRequest } from "../services/fleet/fleetRequestService";
import { sendPrivateShiftError } from "./privateShiftHttp";

export interface FleetPortalHelpers {
  payoutsTab: RequestHandler;
  ownerOnly: RequestHandler;
  isOwner: (req: Request) => boolean;
  fleetContext: (req: Request) => Promise<{ tenantId: string; fleetPartnerId: string } | null>;
  supportingDocuments: (
    ctx: { tenantId: string; fleetPartnerId: string },
    body: unknown,
    userId: string,
  ) => Promise<string[]>;
}

export function registerFleetPrivateShiftRoutes(router: Router, h: FleetPortalHelpers): void {
  const q = (req: Request, key: string) =>
    typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;

  router.get("/vehicle-rates", h.payoutsTab, async (req: Request, res: Response) => {
    try {
      const ctx = await h.fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      const [rates, pending] = await Promise.all([
        getFleetVehicleRates(ctx.tenantId, ctx.fleetPartnerId),
        prisma.fleetChangeRequest.findFirst({
          where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId, type: "RATE_CHANGE", status: "PENDING" },
          orderBy: { createdAt: "desc" },
          select: { id: true, payload: true, createdAt: true },
        }),
      ]);
      const payload = (pending?.payload ?? {}) as Record<string, unknown>;
      res.json({
        ...rates,
        canPropose: h.isOwner(req),
        // Any open price ask blocks a second one (one at a time, revision 14),
        // so the screen needs to know about either kind.
        pending: pending
          ? {
              id: pending.id,
              kind: Array.isArray(payload.vehicleRates) ? "VEHICLE_RATES" : "BASE_RATE",
              vehicleRates: Array.isArray(payload.vehicleRates) ? payload.vehicleRates : null,
              reason: typeof payload.reason === "string" ? payload.reason : null,
              createdAt: pending.createdAt,
            }
          : null,
      });
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.post("/vehicle-rates", h.payoutsTab, h.ownerOnly, async (req: Request, res: Response) => {
    try {
      const ctx = await h.fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      const rates = parseFleetVehicleRates(req.body?.rates);
      if (rates.length === 0) { res.status(400).json({ error: "Send a rate for at least one vehicle type" }); return; }

      const existing = await prisma.fleetChangeRequest.findFirst({
        where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId, type: "RATE_CHANGE", status: "PENDING" },
        select: { id: true },
      });
      if (existing) {
        res.status(409).json({
          error: "A price change is already waiting on Darb. Withdraw it first to send a new one.",
          code: "RATE_REQUEST_PENDING",
          requestId: existing.id,
        });
        return;
      }

      const [current, fleet] = await Promise.all([
        getFleetVehicleRates(ctx.tenantId, ctx.fleetPartnerId),
        prisma.fleetPartner.findFirst({ where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId }, select: { name: true } }),
      ]);
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "RATE_CHANGE",
        documentIds: await h.supportingDocuments(ctx, req.body ?? {}, req.user!.userId),
        payload: {
          vehicleRates: rates.map((r) => ({
            vehicleType: r.vehicleType,
            perOrderKwd: r.perOrderKwd?.toFixed(3) ?? null,
            perHourKwd: r.perHourKwd?.toFixed(3) ?? null,
          })),
          // Carried so the approver sees what each number moves from.
          currentVehicleRates: current.rates,
          ...(reason ? { reason } : {}),
        },
        requestedById: req.user?.userId ?? null,
        fleetName: fleet?.name ?? null,
      });
      res.status(201).json({ id: request.id, status: request.status });
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.get("/private-shifts", h.payoutsTab, async (req: Request, res: Response) => {
    try {
      const ctx = await h.fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      const list = await listPrivateShifts({
        tenantId: ctx.tenantId,
        scope: { kind: "FLEET", fleetPartnerId: ctx.fleetPartnerId },
        from: q(req, "from"),
        to: q(req, "to"),
      });
      res.json({ data: list.data });
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });

  router.get("/private-shifts/:id", h.payoutsTab, async (req: Request, res: Response) => {
    try {
      const ctx = await h.fleetContext(req);
      if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
      res.json(
        await getPrivateShiftDetail(ctx.tenantId, req.params.id, { kind: "FLEET", fleetPartnerId: ctx.fleetPartnerId }),
      );
    } catch (err) {
      sendPrivateShiftError(res, err);
    }
  });
}
