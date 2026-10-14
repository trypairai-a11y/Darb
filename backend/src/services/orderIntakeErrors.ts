/**
 * Revision 24 (#4): "Still I have orders outside the drop-off area, must be
 * fixed." An order whose drop is outside the delivery area (more than
 * MAX_OUT_OF_ZONE_KM past the nearest zone, or naming no zone at all) used to
 * be saved as a REJECTED row and parked in Needs review, where it waited for a
 * person who could do nothing with it except tell the merchant afterwards.
 *
 * Every intake that has the merchant on the other end of the request (partner
 * API, the vendor portal form, bulk import, staff entry) now refuses it there
 * and then, with this error, and saves nothing. The merchant hears it while
 * the customer is still on the phone. Only intakes that cannot answer
 * synchronously (the Foodics, Shopify and Salla webhooks) still persist the
 * REJECTED row: it never enters dispatch, and it is the only record the shop
 * has that the order was refused.
 */
export const OUT_OF_AREA_CODE = "DROPOFF_OUT_OF_AREA";
export const OUT_OF_AREA_MESSAGE =
  "The dropoff is outside the delivery area. Check the customer's location pin, or deliver this order another way.";

export class DropoffOutOfAreaError extends Error {
  readonly code = OUT_OF_AREA_CODE;
  readonly rejectionReason = "OUT_OF_ZONE_DROPOFF";
  constructor() {
    super(OUT_OF_AREA_MESSAGE);
    this.name = "DropoffOutOfAreaError";
  }
}

/** The 422 body every synchronous intake answers an out-of-area drop with. */
export function outOfAreaResponseBody() {
  return {
    error: OUT_OF_AREA_MESSAGE,
    code: OUT_OF_AREA_CODE,
    status: "REJECTED" as const,
    rejectionReason: "OUT_OF_ZONE_DROPOFF" as const,
  };
}
