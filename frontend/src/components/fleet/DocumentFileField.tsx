"use client";
// Revision 13 (#2) — the import button on every document panel.
//
// The client reported that Add document has no way to attach the actual file,
// only a type and an expiry date. The picker existed; it was rendered behind
// `{storageConfigured && ...}` on the driver profile and the company documents
// page, and R2 is not configured on the production API, so in production it
// simply was not there.
//
// Client note (2026-08-31): "still I can't see the documents". The disabled
// state itself was the remaining gap — with storage off, the file never
// travelled, so there was never anything to view. uploadFleetDocument now
// falls back to inline bytes when the presign endpoint answers
// STORAGE_NOT_CONFIGURED, so the field is ALWAYS live. `storageConfigured`
// is kept on the signature so callers did not have to change, but it no
// longer disables anything.
import { Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

/** What the API accepts. Kept in step with the presign endpoint's allow-list. */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export default function DocumentFileField({
  file,
  onChange,
  compact = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  storageConfigured?: boolean;
  /** Sits beside an expiry input on the Add driver panel rather than under it. */
  compact?: boolean;
}) {
  const { t } = useI18n();

  const label = file
    ? compact
      ? file.name.slice(0, 14)
      : file.name
    : t("fleetPortal.importFile");

  return (
    <div className={compact ? "shrink-0" : "space-y-1.5"}>
      <label
        className={cn(
          "inline-flex items-center gap-2 h-10 px-3 rounded-xl border text-sm",
          compact ? "text-xs" : "w-full",
          "border-sand-300 text-sand-700 cursor-pointer hover:bg-sand-100",
        )}
      >
        <Upload size={compact ? 14 : 15} aria-hidden="true" />
        <span dir="auto">{label}</span>
        <input
          type="file"
          className="hidden"
          accept={ACCEPT}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
