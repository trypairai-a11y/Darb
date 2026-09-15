/**
 * Revision 20 — the machine's first pass over an uploaded document.
 *
 * The client's words: "whenever a new driver document is uploaded, the system
 * will verify the documents first after that the compliance team will either
 * approve or reject".
 *
 * So this runs the moment a file lands and it is ADVISORY. It never approves
 * and never rejects. A checker that could reject on its own would reject a
 * valid licence for being a photograph of a photocopy, the upload would vanish
 * into REJECTED, and the only person who could have told the difference would
 * never have seen it. What it does instead is answer "is there anything
 * obviously wrong with this before a human spends a minute on it", and put the
 * reasons on the row so the desk opens the flagged ones first.
 *
 * Everything here is checkable from the row itself. There is deliberately no
 * OCR and no image classifier: both would need a service that is not wired up
 * in production, and a check that silently stops running is worse than one
 * that was never claimed.
 */
import {
  deriveDocHealth,
  isCompanyDocType,
  isDriverDocType,
} from "../fleet/fleetDocumentService";

/** PASS = nothing to say. FLAG = a human should look at this one first. */
export type AutoCheckVerdict = "PASS" | "FLAG";

export interface AutoCheckNote {
  /** Stable key, so the UI can translate rather than print English from the DB. */
  code:
    | "NO_FILE"
    | "NO_EXPIRY"
    | "ALREADY_EXPIRED"
    | "EXPIRES_SOON"
    | "EXPIRY_IMPLAUSIBLE"
    | "UNKNOWN_TYPE"
    | "TYPE_MISMATCH"
    | "FILE_TOO_SMALL"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_FORMAT"
    | "DUPLICATE_PENDING";
  /** English for the audit trail. The UI shows its own translation of `code`. */
  detail: string;
}

export interface AutoCheckResult {
  verdict: AutoCheckVerdict;
  notes: AutoCheckNote[];
  /** Health derived from the expiry, so the desk sees it without recomputing. */
  health: string;
}

/** What a scan of an official document plausibly is. */
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

/** Below this a "scan" is a thumbnail or a failed upload, not a document. */
const MIN_BYTES = 8 * 1024;
/** The inline-bytes ceiling. R2 uploads are capped the same way upstream. */
const MAX_BYTES = 3 * 1024 * 1024;

/** An expiry this far out is a typo (2226 for 2026), not a thirty-year permit. */
const MAX_YEARS_AHEAD = 25;

export interface AutoCheckInput {
  type: string;
  /** True when the document has a file behind it (R2 key or inline bytes). */
  hasFile: boolean;
  mimeType?: string | null;
  sizeBytes?: number | null;
  expiryDate?: Date | null;
  /** Another PENDING_REVIEW document of the same type already waiting. */
  duplicatePending?: boolean;
  /** Which side this belongs to, so the type list can be checked. */
  scope: "DRIVER" | "COMPANY" | "VENDOR";
}

/**
 * Run the pass. Pure, so the route can call it inside its own transaction and
 * the tests do not need a database.
 */
export function runAutoCheck(input: AutoCheckInput, now = new Date()): AutoCheckResult {
  const notes: AutoCheckNote[] = [];

  // ── The type is one we know ──────────────────────────────────────────────
  const knownForScope =
    input.scope === "DRIVER" ? isDriverDocType(input.type) : isCompanyDocType(input.type);
  if (!knownForScope) {
    // Not fatal: the catalogue widens faster than this file does, and a type
    // the desk recognises but the code does not is still reviewable.
    notes.push({
      code: isDriverDocType(input.type) || isCompanyDocType(input.type) ? "TYPE_MISMATCH" : "UNKNOWN_TYPE",
      detail:
        isDriverDocType(input.type) || isCompanyDocType(input.type)
          ? `${input.type} is not a ${input.scope.toLowerCase()} document type`
          : `${input.type} is not in the document catalogue`,
    });
  }

  // ── There is a file ──────────────────────────────────────────────────────
  if (!input.hasFile) {
    // The fleet portal deliberately allows an expiry with no file while R2 is
    // unconfigured, so this is a flag rather than a refusal.
    notes.push({ code: "NO_FILE", detail: "No scan attached, only a stated expiry date" });
  } else {
    if (input.mimeType && !ACCEPTED_MIME.has(input.mimeType.toLowerCase())) {
      notes.push({
        code: "UNSUPPORTED_FORMAT",
        detail: `${input.mimeType} is not a document scan format`,
      });
    }
    if (typeof input.sizeBytes === "number") {
      if (input.sizeBytes < MIN_BYTES) {
        notes.push({
          code: "FILE_TOO_SMALL",
          detail: `${input.sizeBytes} bytes is too small to be a readable scan`,
        });
      } else if (input.sizeBytes > MAX_BYTES) {
        notes.push({
          code: "FILE_TOO_LARGE",
          detail: `${input.sizeBytes} bytes is over the ${MAX_BYTES} byte ceiling`,
        });
      }
    }
  }

  // ── The expiry is present, in the future, and plausible ──────────────────
  const expiry = input.expiryDate ?? null;
  // The selfie has no natural expiry and is the one type where a missing date
  // means nothing at all.
  const expiryOptional = input.type === "DRIVER_SELFIE";
  if (!expiry) {
    if (!expiryOptional) {
      notes.push({ code: "NO_EXPIRY", detail: "No expiry date given" });
    }
  } else {
    const ms = expiry.getTime() - now.getTime();
    if (ms < 0) {
      notes.push({
        code: "ALREADY_EXPIRED",
        detail: `Expired on ${expiry.toISOString().slice(0, 10)}`,
      });
    } else if (ms < 30 * 86_400_000) {
      notes.push({
        code: "EXPIRES_SOON",
        detail: `Expires on ${expiry.toISOString().slice(0, 10)}, inside 30 days`,
      });
    }
    if (ms > MAX_YEARS_AHEAD * 365 * 86_400_000) {
      notes.push({
        code: "EXPIRY_IMPLAUSIBLE",
        detail: `${expiry.toISOString().slice(0, 10)} is more than ${MAX_YEARS_AHEAD} years out`,
      });
    }
  }

  if (input.duplicatePending) {
    notes.push({
      code: "DUPLICATE_PENDING",
      detail: "Another document of this type is already waiting for review",
    });
  }

  return {
    verdict: notes.length === 0 ? "PASS" : "FLAG",
    notes,
    health: expiryOptional && !expiry ? "VALID" : deriveDocHealth(expiry, now),
  };
}
