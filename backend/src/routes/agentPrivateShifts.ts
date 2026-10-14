/**
 * Revision 24 (#11) — private shifts in the driver app. Mounted at
 * /api/agent/private-shifts, device-token auth like the rest of /api/agent.
 *
 *   GET  /              { eligible, open: [...], mine: [...] }
 *   GET  /current       the running (or next) shift and the live rule status
 *   POST /:id/book      take an open shift (eligible drivers, matching vehicle)
 *   POST /:id/release   give a booked shift back before it starts
 *   POST /:id/start     start it, standing at the shop: body { latitude, longitude }
 *                       409 NOT_AT_VENDOR { distanceM, radiusM } when too far
 *   POST /:id/end       end it; the settlement is written there and then
 *
 * "For the driver, it is optional to book the normal shift or book a private
 * shift": nothing here touches the regular shift endpoints.
 */
import { Router, Request, Response } from "express";
import { resolveDriverFromAgentRequest } from "./agent";
import {
  bookPrivateShift,
  currentForDriver,
  endPrivateShift,
  listForDriver,
  releasePrivateShift,
  startPrivateShift,
  type DriverLike,
} from "../services/privateShifts/privateShiftService";
import { sendPrivateShiftError } from "./privateShiftHttp";

const router = Router();

async function driverOf(req: Request, res: Response): Promise<DriverLike | null> {
  const identity = await resolveDriverFromAgentRequest(req);
  if (!identity) {
    res.status(404).json({ error: "Device or driver not found" });
    return null;
  }
  const d = identity.driver as unknown as DriverLike;
  return {
    id: d.id,
    tenantId: d.tenantId,
    vehicleType: d.vehicleType,
    status: d.status,
    privateShiftEligible: !!d.privateShiftEligible,
    fleetPartnerId: d.fleetPartnerId ?? null,
  };
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const driver = await driverOf(req, res);
    if (!driver) return;
    res.json(await listForDriver(driver));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.get("/current", async (req: Request, res: Response) => {
  try {
    const driver = await driverOf(req, res);
    if (!driver) return;
    res.json(await currentForDriver(driver));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/:id/book", async (req: Request, res: Response) => {
  try {
    const driver = await driverOf(req, res);
    if (!driver) return;
    res.json(await bookPrivateShift(driver, req.params.id));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/:id/release", async (req: Request, res: Response) => {
  try {
    const driver = await driverOf(req, res);
    if (!driver) return;
    res.json(await releasePrivateShift(driver, req.params.id));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/:id/start", async (req: Request, res: Response) => {
  try {
    const driver = await driverOf(req, res);
    if (!driver) return;
    res.json(
      await startPrivateShift(driver, req.params.id, { lat: req.body?.latitude, lng: req.body?.longitude }),
    );
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

router.post("/:id/end", async (req: Request, res: Response) => {
  try {
    const driver = await driverOf(req, res);
    if (!driver) return;
    res.json(await endPrivateShift(driver, req.params.id));
  } catch (err) {
    sendPrivateShiftError(res, err);
  }
});

export default router;
