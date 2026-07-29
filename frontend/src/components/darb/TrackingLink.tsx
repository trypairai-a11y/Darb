"use client";
// The customer's tracking link, with a copy button.
//
// The tracking page tells customers "the shop you ordered from can send it
// again", and that was not true: the token reached the WhatsApp message and
// the partner API response, and nothing else. A merchant taking orders through
// the portal, and every member of Darb ops, had no way to see the link, so a
// WhatsApp message that failed to land could not be recovered by anyone.
//
// The URL comes from the server, built by the same helper that builds the
// message, so what gets copied is exactly what the customer was sent.
import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export default function TrackingLink({ url }: { url?: string | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  // Null whenever PUBLIC_TRACKING_BASE_URL is unset, and on orders old enough
  // to predate tokens. Rendering nothing beats rendering a dead control.
  if (!url) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, or permission denied): the link
      // is on screen and selectable, so there is still a way to get it.
    }
  }

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-sand-200 bg-sand-100/60">
      <Link2 size={16} className="text-sand-500 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-sand-600">{t("common.trackingLink")}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="block text-xs font-mono text-primary truncate hover:underline"
        >
          {url}
        </a>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1.5 px-3 h-8 shrink-0 rounded-pill bg-white border border-sand-300 text-xs font-medium text-sand-800 hover:bg-sand-100 transition-colors"
      >
        {copied ? (
          <Check size={12} className="text-green-600" aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </div>
  );
}
