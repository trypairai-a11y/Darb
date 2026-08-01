/**
 * Revision 13b (client note) — the stamped invoice behind a payout confirmation.
 *
 * The client asked for two things about confirming a payout: see the invoice
 * detail first, and confirm BY uploading the company's stamped invoice. So a
 * confirmation is no longer a click, it is a document, and this is where that
 * document is read in and handed back out.
 *
 * Two stores, deliberately. When R2 is configured the browser PUTs straight to
 * it and only the object key comes here, which is how every other file in this
 * portal works. When it is not — which is production today — the bytes come
 * inline and land in Postgres. A confirmation gate that nobody can pass would
 * be a worse answer than a megabyte in a bytea column, and one invoice per
 * statement per month is a dozen rows a year per delivery company.
 *
 * `fileKey` is always preferred when both are present, so nothing has to be
 * migrated the day R2 is switched on: new invoices simply stop carrying bytes.
 */
import type { Response } from "express";
import { presignGetUrl } from "../r2Service";

export const INVOICE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * 3 MB of file, ~4 MB once base64 adds a third. Vercel refuses a request body
 * over 4.5 MB at the edge, where no error message this code writes would ever
 * be seen, so the cap sits below it.
 */
export const INVOICE_MAX_BYTES = 3 * 1024 * 1024;

export interface InvoiceInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileKey: string | null;
  fileData: Buffer | null;
}

export interface InvoiceInputResult {
  value?: InvoiceInput;
  error?: string;
}

/**
 * Validate one invoice submission: either an R2 key or inline base64 bytes.
 *
 * Returns `{}` when the caller sent no file at all, which the confirm endpoint
 * reads as "no invoice attached" rather than as an error, because a statement
 * that already has one may be re-confirmed after a dispute.
 */
export function readInvoiceInput(body: any, keyPrefix?: string): InvoiceInputResult {
  const { fileName, mimeType, fileKey, dataBase64 } = body ?? {};
  if (!fileName && !fileKey && !dataBase64) return {};

  if (typeof fileName !== "string" || fileName.trim().length === 0) {
    return { error: "The invoice needs a file name" };
  }
  if (typeof mimeType !== "string" || !(INVOICE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { error: "The invoice must be a PDF, JPEG, PNG or WEBP" };
  }

  if (typeof fileKey === "string" && fileKey.length > 0) {
    // The PUT we sign always lives under `${tenantId}/fleet/${fleetPartnerId}/`
    // (routes/fleetPortal.ts). Nothing used to check that the key coming BACK
    // was under the same prefix, so a caller could name any object in the
    // bucket and have the download endpoint presign a GET for it.
    if (keyPrefix && !fileKey.startsWith(keyPrefix)) {
      return { error: "That file does not belong to this account" };
    }
    const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;
    if (sizeBytes > INVOICE_MAX_BYTES) return { error: "The invoice must be under 3 MB" };
    return {
      value: {
        fileName: fileName.trim(), mimeType, sizeBytes,
        fileKey, fileData: null,
      },
    };
  }

  if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
    return { error: "Attach the stamped invoice" };
  }
  // A data: URL pasted straight from a FileReader is the likeliest client
  // mistake, and stripping it costs one line.
  const base64 = dataBase64.includes(",") ? dataBase64.slice(dataBase64.indexOf(",") + 1) : dataBase64;
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return { error: "The invoice file could not be read" };
  }
  if (buf.length === 0) return { error: "The invoice file is empty" };
  if (buf.length > INVOICE_MAX_BYTES) return { error: "The invoice must be under 3 MB" };

  return {
    value: {
      fileName: fileName.trim(), mimeType, sizeBytes: buf.length,
      fileKey: null, fileData: buf,
    },
  };
}

/** What the download endpoints need off a stored invoice. */
export interface StoredInvoice {
  fileName: string;
  mimeType: string;
  fileKey: string | null;
  fileData: Buffer | Uint8Array | null;
}

/**
 * Hand an invoice back: a redirect to a short-lived signed URL when it lives in
 * R2, the bytes themselves when it does not.
 *
 * `inline` rather than `attachment`, so a PDF opens in the tab an accountant is
 * already in instead of landing in their downloads folder.
 */
export async function sendInvoice(res: Response, invoice: StoredInvoice): Promise<void> {
  if (invoice.fileKey) {
    res.redirect(await presignGetUrl(invoice.fileKey, 3600));
    return;
  }
  if (!invoice.fileData) {
    res.status(404).json({ error: "That invoice file is missing" });
    return;
  }
  res.setHeader("Content-Type", invoice.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${invoice.fileName.replace(/["\\]/g, "")}"`,
  );
  res.send(Buffer.from(invoice.fileData));
}
