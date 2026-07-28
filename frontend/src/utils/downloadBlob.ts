import api from "@/lib/api";

/**
 * Hand a Blob to the browser as a file download.
 *
 * The anchor has to be in the document and the object URL has to outlive the
 * click. A detached `a.click()` is a no-op in Firefox, and revoking the URL on
 * the same tick cancels the download in Safari, which is how a 200 response
 * with a correct Content-Disposition still ended up saving nothing. Chrome
 * tolerates both, so this only ever failed for some people.
 */
export function triggerDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Let the download start before the URL stops resolving.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

/** Fetch `url` as a blob through the authed axios client and save it. */
export async function downloadBlob(url: string, filename: string) {
  const res = await api.get(url, { responseType: "blob" });
  triggerDownload(res.data as Blob, filename);
}
