/** Revision 24: one way every private-shift endpoint answers an error. */
import type { Response } from "express";
import { PrivateShiftError } from "../services/privateShifts/privateShiftService";

export function sendPrivateShiftError(res: Response, err: unknown): void {
  if (err instanceof PrivateShiftError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code, ...err.extra });
    return;
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  res.status(status).json({ error: (err as Error).message });
}
